import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function parseProduct(p: Record<string, unknown>) {
  return { ...p, rawImageUrls: JSON.parse((p.rawImageUrls as string) ?? "[]") };
}

// GET /api/products/[productId] — 產品詳情（含它擁有的資產）
export async function GET(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { assets: { orderBy: { createdAt: "desc" } } },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(parseProduct(product as unknown as Record<string, unknown>));
}

// PATCH /api/products/[productId] — 更新產品欄位
export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const body = await request.json();
  const updateData: Record<string, unknown> = { ...body };
  if (Array.isArray(body.rawImageUrls)) updateData.rawImageUrls = JSON.stringify(body.rawImageUrls);
  // 不可透過 PATCH 改動識別/關聯欄位
  delete updateData.id;
  delete updateData.clientId;
  delete updateData.assets;
  delete updateData._count;
  delete updateData.createdAt;

  const product = await db.product.update({ where: { id: productId }, data: updateData });
  return NextResponse.json(parseProduct(product as unknown as Record<string, unknown>));
}

// DELETE /api/products/[productId]
// 資產（LibraryImage.productId）是真正的 FK、onDelete: SetNull →
// 刪產品後這些素材自動變回「一般素材」（productId 設為 null），不會刪圖。
export async function DELETE(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  await db.product.delete({ where: { id: productId } });
  return NextResponse.json({ success: true });
}
