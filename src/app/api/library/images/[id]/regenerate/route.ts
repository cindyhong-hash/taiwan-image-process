import { after, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { protectPaidRoute } from "@/lib/site-gate";
import {
  createImageSetExecution,
  prepareImageSetRegeneration,
  reconcileStaleImageSetWork,
  regenerateImageSetItem,
  requestImageSetRegeneration,
} from "@/lib/products/image-set-orchestrator";

// Vercel Hobby 硬上限 300s；設 290（單張重生，遠低於上限，足夠）。
export const maxDuration = 290;

/** Re-runs only one saved product image-set role; sibling assets are never touched. */
export const POST = protectPaidRoute(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
  { invocationStartedAt },
) => {
  const { id } = await params;
  const target = await db.libraryImage.findUnique({
    where: { id },
    include: { product: { include: { client: true } } },
  });
  if (!target) return NextResponse.json({ error: "找不到這張素材" }, { status: 404 });
  if (!target.product) return NextResponse.json({ error: "找不到這張素材所屬的產品" }, { status: 400 });
  await reconcileStaleImageSetWork(target.product.id, new Date());
  const execution = createImageSetExecution(invocationStartedAt, randomUUID());
  const result = await requestImageSetRegeneration(id, execution, {
    prepare: prepareImageSetRegeneration,
    claimFailedRow: async (rowId, value) => {
      const claimed = await db.libraryImage.updateMany({
        where: { id: rowId, productId: target.product!.id, status: "FAILED" },
        data: {
          status: "GENERATING",
          errorMessage: null,
          generationLeaseId: value.leaseId,
          generationLeaseExpiresAt: new Date(value.deadlineAt),
        },
      });
      return claimed.count === 1;
    },
    rollbackClaimedRow: async (rowId, value) => {
      const rolledBack = await db.libraryImage.updateMany({
        where: {
          id: rowId,
          productId: target.product!.id,
          status: "GENERATING",
          generationLeaseId: value.leaseId,
          generationLeaseExpiresAt: new Date(value.deadlineAt),
        },
        data: {
          status: "FAILED",
          errorMessage: "背景工作未能啟動，請重新產生。",
          generationLeaseId: null,
          generationLeaseExpiresAt: null,
        },
      });
      return rolledBack.count === 1;
    },
    scheduleAfter: (callback) => after(callback),
    regenerate: regenerateImageSetItem,
    logError: (...values) => console.error(...values),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id, status: result.status });
});
