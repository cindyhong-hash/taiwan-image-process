import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { buildImageSetSuggestions, generateImageSetItem, type SetItem } from "@/lib/imageSet";

export const maxDuration = 120;

// GET /api/products/[productId]/image-set — AI 建議的套圖積木清單
export async function GET(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const client = await db.client.findUnique({ where: { id: product.clientId } });
  const suggestions = buildImageSetSuggestions(product, client);
  return NextResponse.json({ suggestions, hasHero: !!product.heroImageUrl });
}

// POST /api/products/[productId]/image-set — 批次生成勾選的套圖積木
// body: { items: SetItem[] }
export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const body = await request.json().catch(() => ({}));
  const items: SetItem[] = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: "未選擇任何套圖" }, { status: 400 });

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 實拍類（edit）需要去背主圖當錨點
  if (items.some((i) => i.path === "edit") && !product.heroImageUrl) {
    return NextResponse.json({ error: "請先為產品產生去背主圖，才能生成實拍類套圖" }, { status: 400 });
  }

  const client = await db.client.findUnique({ where: { id: product.clientId } });
  const batchId = `pset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const created: { id: string; role: string; label: string }[] = [];
  for (const item of items) {
    const row = await db.libraryImage.create({
      data: {
        clientId: product.clientId,
        productId: product.id,
        assetRole: item.role,
        subject: item.label,
        status: "GENERATING",
        batchId,
        paramsJson: JSON.stringify({ imageSet: true, item }),
      },
    });
    created.push({ id: row.id, role: item.role, label: item.label });
    after(() => generateImageSetItem(row.id, product, client, item));
  }

  return NextResponse.json({ batchId, items: created });
}
