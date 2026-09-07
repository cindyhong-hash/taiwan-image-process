import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { protectPaidRoute } from "@/lib/site-gate";
import {
  analyzeImageSetProduct,
  claimProductPaidOperationLease,
  createImageSetExecution,
  reconcileStaleImageSetWork,
  releaseProductPaidOperationLease,
  requestImageSetAnalysis,
} from "@/lib/products/image-set-orchestrator";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export const POST = protectPaidRoute(async (
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
  { invocationStartedAt },
) => {
  const { productId } = await params;
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;
  const product = await db.product.findUnique({ where: { id: productId }, include: { client: true } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await reconcileStaleImageSetWork(product.id, new Date());
  const execution = createImageSetExecution(invocationStartedAt, randomUUID(), 110_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Image-set analysis absolute deadline reached")), Math.max(0, execution.deadlineAt - Date.now()));
  try {
    const result = await requestImageSetAnalysis({
      product,
      client: product.client,
      force,
      execution,
      signal: controller.signal,
    }, {
      now: Date.now,
      claimProductLease: claimProductPaidOperationLease,
      releaseProductLease: releaseProductPaidOperationLease,
      analyze: (signal) => analyzeImageSetProduct(product, product.client, force, undefined, signal),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.value);
  } finally {
    clearTimeout(timer);
  }
});
