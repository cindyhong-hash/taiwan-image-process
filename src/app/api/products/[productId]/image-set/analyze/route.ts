import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyzeImageSetProduct } from "@/lib/products/image-set-orchestrator";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const client = await db.client.findUnique({ where: { id: product.clientId } });
  return NextResponse.json(await analyzeImageSetProduct(product, client, force));
}
