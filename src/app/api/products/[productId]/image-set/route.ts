import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createAndScheduleImageSetBatch,
  readImageSetProduct,
  runImageSetBatch,
} from "@/lib/products/image-set-orchestrator";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

// GET is intentionally read-only: the modal decides when it wants the paid analysis endpoint.
export async function GET(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const client = await db.client.findUnique({ where: { id: product.clientId } });
  return NextResponse.json(await readImageSetProduct(product, client));
}

// POST creates rows synchronously, then schedules one resilient batch callback.
export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const body = await request.json().catch(() => ({}));
  const requestedItems: unknown[] = Array.isArray(body.items) ? body.items : [];
  const selectedRoles = [...new Set(requestedItems.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const role = (item as { role?: unknown }).role;
    return typeof role === "string" ? [role] : [];
  }))];
  if (!selectedRoles.length) return NextResponse.json({ error: "未選擇任何套圖" }, { status: 400 });

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const client = await db.client.findUnique({ where: { id: product.clientId } });
  const result = await createAndScheduleImageSetBatch({
    product,
    client,
    selectedRoles,
    requestSourceHash: typeof body.sourceHash === "string" ? body.sourceHash : undefined,
  }, {
    createRows: (rows) => db.$transaction((tx) => Promise.all(rows.map((data) => tx.libraryImage.create({ data })))),
    scheduleAfter: (callback) => after(callback),
    runBatch: (input) => runImageSetBatch(input),
    createBatchId: () => `pset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
