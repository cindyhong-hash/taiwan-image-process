import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cutoutHero } from "@/lib/product";

export const maxDuration = 60;

// POST /api/products/[productId]/hero — (重新)去背產生產品主圖
// body: { imageUrl?: string }  未給則用第一張原始照
export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const body = await request.json().catch(() => ({} as { imageUrl?: string }));

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw: string[] = JSON.parse((product.rawImageUrls as string) ?? "[]");
  const source: string | undefined = body.imageUrl || raw[0];
  if (!source) return NextResponse.json({ error: "無原始照可去背" }, { status: 400 });

  const hero = await cutoutHero(source);
  if (!hero) return NextResponse.json({ error: "去背失敗（請確認 FAL_KEY 或稍後再試）" }, { status: 500 });

  await db.product.update({ where: { id: productId }, data: { heroImageUrl: hero } });
  return NextResponse.json({ heroImageUrl: hero });
}
