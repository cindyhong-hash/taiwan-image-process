/* ============================================================
   POST /api/magic-layers/ad-layout
   AI 幫我排版：用商品素材包 + 用途，組成一張「~80% 完成」的可編輯設計稿（真 LayerData[]）。
   Body: { clientId, productId, purpose?, ratio?, title?, subtitle? }
   Returns: { layers, canvasWidth, canvasHeight } | { error }
   ============================================================ */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAdLayoutLayers, type AdLayoutInput } from "@/lib/magic-layers/compose-layers.ts";
import { loadBuffer, saveBuffer } from "@/lib/storage";
import sharp from "sharp";

export const maxDuration = 120;

const RATIO_SIZE: Record<string, [number, number]> = {
  "1:1": [1024, 1024], "4:5": [1024, 1280], "9:16": [720, 1280], "16:9": [1280, 720],
};

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) { const s = value.find((v) => typeof v === "string" && v.trim()); return typeof s === "string" ? s : undefined; }
  try { const p = JSON.parse(String(value ?? "")); return Array.isArray(p) ? (p.find((v) => typeof v === "string") as string | undefined) : undefined; } catch { return undefined; }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientId = String(body.clientId ?? "");
    const productId = String(body.productId ?? "");
    if (!clientId || !productId) return NextResponse.json({ error: "clientId and productId required" }, { status: 400 });

    const purpose = (["product", "benefit", "scene", "promo"].includes(body.purpose) ? body.purpose : "product") as AdLayoutInput["purpose"];
    const ratio = typeof body.ratio === "string" && RATIO_SIZE[body.ratio] ? body.ratio : "4:5";
    const [W, H] = RATIO_SIZE[ratio];

    const product = await db.product.findUnique({
      where: { id: productId },
      select: { clientId: true, heroImageUrl: true, assets: { where: { status: "DONE" }, select: { assetRole: true, imageUrl: true } } },
    });
    if (!product || product.clientId !== clientId) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const client = await db.client.findUnique({ where: { id: clientId }, select: { logoUrls: true } });

    const byRole = (role: string) => product.assets.find((a) => a.assetRole === role && a.imageUrl)?.imageUrl || undefined;
    const rawBg = byRole("background");
    const heroUrl = product.heroImageUrl || byRole("hero") || undefined;
    const decorationUrl = byRole("decoration");
    const textureUrl = byRole("detail");
    const logoUrl = firstString(client?.logoUrls);

    if (!rawBg && !heroUrl) return NextResponse.json({ error: "此產品尚未有可用的情境背景或商品主體素材" }, { status: 400 });

    // 背景 contain-fit 到畫布尺寸（無背景素材時用白底，商品主體仍可排上去）。
    let backgroundUrl: string;
    try {
      const base = rawBg
        ? await sharp(Buffer.from(await loadBuffer(rawBg))).resize(W, H, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
        : sharp({ create: { width: W, height: H, channels: 3, background: { r: 248, g: 249, b: 252 } } });
      backgroundUrl = await saveBuffer(await base.png().toBuffer(), "png", "ml-adlayout-bg-");
    } catch {
      return NextResponse.json({ error: "背景處理失敗" }, { status: 500 });
    }

    const layers = await buildAdLayoutLayers({
      backgroundUrl, heroUrl, decorationUrl, textureUrl, logoUrl,
      title: typeof body.title === "string" ? body.title.trim() || undefined : undefined,
      subtitle: typeof body.subtitle === "string" ? body.subtitle.trim() || undefined : undefined,
      purpose, canvasWidth: W, canvasHeight: H,
    });

    return NextResponse.json({ layers, canvasWidth: W, canvasHeight: H });
  } catch (err) {
    console.error("[magic-layers/ad-layout] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
