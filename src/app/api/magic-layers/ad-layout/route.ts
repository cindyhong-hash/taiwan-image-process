/* ============================================================
   POST /api/magic-layers/ad-layout
   AI 幫我排版：用商品素材包 + 用途，組成一張「~80% 完成」的可編輯設計稿（真 LayerData[]）。
   Body: { clientId, productId, purpose?, ratio?, title?, subtitle? }
   Returns: { options: AdLayoutOption[], canvasWidth, canvasHeight } | { error }
   ============================================================ */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAdLayoutCandidates, type AdLayoutCandidateId, type AdLayoutInput } from "@/lib/magic-layers/compose-layers.ts";
import { prepareAdBackground, resolveTextSafeTreatment } from "@/lib/magic-layers/ad-layout-data.ts";
import { templateFor } from "@/lib/magic-layers/ad-layout-templates.ts";
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

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
  } catch { return []; }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientId = String(body.clientId ?? "");
    const productId = String(body.productId ?? "");
    if (!clientId || !productId) return NextResponse.json({ error: "clientId and productId required" }, { status: 400 });

    const purpose = (["product", "benefit", "scene", "promo"].includes(body.purpose) ? body.purpose : "product") as NonNullable<AdLayoutInput["purpose"]>;
    const ratio = typeof body.ratio === "string" && RATIO_SIZE[body.ratio] ? body.ratio : "4:5";
    const [W, H] = RATIO_SIZE[ratio];

    const product = await db.product.findUnique({
      where: { id: productId },
      select: {
        clientId: true, name: true, description: true, category: true, visualProfileJson: true, heroImageUrl: true, primaryColorOverride: true,
        assets: { where: { status: "DONE" }, select: { assetRole: true, imageUrl: true } },
      },
    });
    if (!product || product.clientId !== clientId) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { name: true, description: true, industry: true, logoUrls: true, primaryColor: true, secondaryColor: true, toneLabels: true, paletteColors: true, fonts: true },
    });

    const byRole = (role: string) => product.assets.find((a) => a.assetRole === role && a.imageUrl)?.imageUrl || undefined;
    const rawBg = byRole("background");
    const heroUrl = product.heroImageUrl || byRole("hero") || undefined;
    const decorationUrl = byRole("decoration");
    const textureUrl = byRole("detail");
    const benefitUrl = byRole("benefit");
    const logoUrl = firstString(client?.logoUrls);

    if (!rawBg && !heroUrl) return NextResponse.json({ error: "此產品尚未有可用的情境背景或商品主體素材" }, { status: 400 });

    // 以 full-bleed cover 準備背景，避免 contain 產生白邊／像貼上去的照片。
    let backgroundUrl: string;
    let backgroundBuffer: Buffer;
    try {
      const source = rawBg
        ? Buffer.from(await loadBuffer(rawBg))
        : await sharp({ create: { width: W, height: H, channels: 3, background: { r: 248, g: 249, b: 252 } } }).png().toBuffer();
      backgroundBuffer = await prepareAdBackground(source, W, H);
      backgroundUrl = await saveBuffer(backgroundBuffer, "png", "ml-adlayout-bg-");
    } catch {
      return NextResponse.json({ error: "背景處理失敗" }, { status: 500 });
    }

    const accentColor = product.primaryColorOverride || client?.primaryColor || "#6d4aff";
    const directions: AdLayoutCandidateId[] = ["product-focus", "editorial", "scene-led"];
    const textSafeTreatment = Object.fromEntries(await Promise.all(directions.map(async (direction) => {
      const template = templateFor(direction, purpose, ratio);
      const treatment = await resolveTextSafeTreatment(backgroundBuffer, template.zones.safePanel, accentColor);
      return [direction, treatment.panelTreatment] as const;
    })));
    const tones = stringList(client?.toneLabels).slice(0, 3);
    const palette = stringList(client?.paletteColors).slice(0, 3);
    const artDirection = [
      client?.description || client?.industry,
      tones.length ? tones.join("、") : undefined,
      product.description || product.category,
      palette.length ? `色彩：${palette.join("、")}` : undefined,
    ].filter(Boolean).join("；") || `以「${product.name}」完成乾淨清楚的品牌產品設計`;
    const options = buildAdLayoutCandidates({
      backgroundUrl, heroUrl, decorationUrl, textureUrl, benefitUrl, logoUrl,
      title: typeof body.title === "string" ? body.title.trim() || undefined : undefined,
      subtitle: typeof body.subtitle === "string" ? body.subtitle.trim() || undefined : undefined,
      brandColor: accentColor, textColor: "#241f47", textSafeTreatment, artDirection,
      purpose, canvasWidth: W, canvasHeight: H,
    });

    return NextResponse.json({
      options: options.map((option) => ({
        ...option,
        preview: {
          backgroundUrl, heroUrl, benefitUrl, decorationUrl,
          textColor: String(((option.layers.find((layer) => layer.id === "text_title")?.meta.style as { color?: unknown } | undefined)?.color) ?? "#241f47"),
          accentColor, purpose,
        },
      })),
      canvasWidth: W,
      canvasHeight: H,
    });
  } catch (err) {
    console.error("[magic-layers/ad-layout] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
