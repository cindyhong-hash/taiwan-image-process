import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cutoutHero } from "@/lib/product";

// 去背走 fal（BiRefNet），可能較慢
export const maxDuration = 60;

function parseProduct(p: Record<string, unknown>) {
  return { ...p, rawImageUrls: JSON.parse((p.rawImageUrls as string) ?? "[]") };
}

// GET /api/products?clientId=xxx — 列出某品牌的產品（供素材庫「產品」分頁）
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const products = await db.product.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { assets: true } } }, // 資產張數：供產品卡顯示
  });
  return NextResponse.json(products.map((p) => parseProduct(p as unknown as Record<string, unknown>)));
}

// POST /api/products — 建立產品，並自動對第一張原始照去背產出主圖
export async function POST(request: Request) {
  const body = await request.json();
  const { clientId, name, description, category, rawImageUrls, primaryColorOverride } = body;
  if (!clientId || !name) {
    return NextResponse.json({ error: "clientId and name are required" }, { status: 400 });
  }
  const raw: string[] = Array.isArray(rawImageUrls) ? rawImageUrls : [];

  const product = await db.product.create({
    data: {
      clientId,
      name,
      description: description || null,
      category: category || null,
      rawImageUrls: JSON.stringify(raw),
      primaryColorOverride: primaryColorOverride || null,
    },
  });

  // 自動去背產出主圖：best-effort，失敗不擋建立（heroImageUrl 留 null 供之後重試）
  let heroWarning: string | null = null;
  if (raw[0]) {
    const hero = await cutoutHero(raw[0]);
    if (hero) {
      await db.product.update({ where: { id: product.id }, data: { heroImageUrl: hero } });
      product.heroImageUrl = hero;
    } else {
      heroWarning = "去背未成功，可稍後於產品頁重試";
    }
  }

  return NextResponse.json(
    { ...parseProduct(product as unknown as Record<string, unknown>), heroWarning },
    { status: 201 },
  );
}
