/* ============================================================
   POST /api/magic-layers/ad-layout
   AI 幫我排版：用商品素材包 + 用途，組成一張「~80% 完成」的可編輯設計稿（真 LayerData[]）。
   Body: { clientId, productId, purpose?, ratio?, title?, subtitle? }
   Returns: { options: AdLayoutOption[], canvasWidth, canvasHeight } | { error }
   ============================================================ */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAdLayoutCandidates, type AdLayoutCandidateId, type AdLayoutInput } from "@/lib/magic-layers/compose-layers.ts";
import { createAdLayoutContext } from "@/lib/magic-layers/ad-layout-context.ts";
import { createCreativeBrief, selectDesignRecipe } from "@/lib/magic-layers/ad-layout-creative-brief.ts";
import { analyzeDesignGaps, planRecipeAssets } from "@/lib/magic-layers/ad-layout-gap-analysis.ts";
import { assessAdLayoutVisualKit } from "@/lib/magic-layers/ad-layout-vision.ts";
import { applyAdLayoutVisionPolicy } from "@/lib/magic-layers/ad-layout-vision-policy.ts";
import { prepareAdBackground, resolveTextSafeTreatment } from "@/lib/magic-layers/ad-layout-data.ts";
import { templateFor } from "@/lib/magic-layers/ad-layout-templates.ts";
import { loadBuffer, saveBuffer } from "@/lib/storage";
import sharp from "sharp";

export const maxDuration = 120;

const RATIO_SIZE: Record<string, [number, number]> = {
  "1:1": [1024, 1024], "4:5": [1024, 1280], "9:16": [720, 1280], "16:9": [1280, 720],
};

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
        id: true, clientId: true, name: true, description: true, category: true, visualProfileJson: true, heroImageUrl: true, primaryColorOverride: true,
        assets: { where: { status: "DONE" }, select: { assetRole: true, imageUrl: true } },
      },
    });
    if (!product || product.clientId !== clientId) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { name: true, description: true, industry: true, logoUrls: true, primaryColor: true, secondaryColor: true, toneLabels: true, paletteColors: true, fonts: true },
    });

    const context = createAdLayoutContext({ product, client, assets: product.assets });
    if (!context.inventory.byRole.hero?.imageUrl) return NextResponse.json({ error: "此產品尚未有商品主體，請先完成去背商品素材再建立設計稿" }, { status: 400 });

    const assessment = await assessAdLayoutVisualKit(context);
    const assessed = applyAdLayoutVisionPolicy(context, assessment);
    const safeContext = assessed.context;
    const rawBg = safeContext.inventory.byRole.background?.imageUrl;
    const heroUrl = safeContext.inventory.byRole.hero?.imageUrl;
    const decorationUrl = safeContext.inventory.byRole.decoration?.imageUrl;
    const textureUrl = safeContext.inventory.byRole.detail?.imageUrl;
    const benefitUrl = safeContext.inventory.byRole.benefit?.imageUrl;
    const logoUrl = safeContext.inventory.logo?.imageUrl;

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

    let heroAspectRatio: number | undefined;
    if (heroUrl) {
      try {
        const metadata = await sharp(Buffer.from(await loadBuffer(heroUrl))).metadata();
        if (metadata.width && metadata.height) heroAspectRatio = metadata.width / metadata.height;
      } catch {
        // The renderer safely falls back to its template zone when metadata cannot be read.
      }
    }

    const accentColor = safeContext.brand.primaryColor;
    const directions: AdLayoutCandidateId[] = ["product-focus", "editorial", "scene-led"];
    const textSafeTreatment = Object.fromEntries(await Promise.all(directions.map(async (direction) => {
      const template = templateFor(direction, purpose, ratio);
      const treatment = await resolveTextSafeTreatment(backgroundBuffer, template.zones.safePanel, accentColor);
      return [direction, treatment.panelTreatment] as const;
    })));
    const tones = safeContext.brand.tones.slice(0, 3);
    const palette = safeContext.brand.palette.slice(0, 3);
    const artDirection = [
      safeContext.brand.description || safeContext.brand.industry,
      tones.length ? tones.join("、") : undefined,
      safeContext.product.description || safeContext.product.category,
      palette.length ? `色彩：${palette.join("、")}` : undefined,
    ].filter(Boolean).join("；") || `以「${product.name}」完成乾淨清楚的品牌產品設計`;
    const brief = createCreativeBrief(safeContext, {
      purpose,
      ratio,
      title: typeof body.title === "string" ? body.title : undefined,
      subtitle: typeof body.subtitle === "string" ? body.subtitle : undefined,
    });
    const recipe = selectDesignRecipe(brief);
    const assetPlan = planRecipeAssets(recipe, brief.inventory);
    const gapPlan = analyzeDesignGaps(brief, recipe, brief.inventory);
    const options = buildAdLayoutCandidates({
      backgroundUrl, heroUrl, decorationUrl, textureUrl, benefitUrl, logoUrl,
      title: typeof body.title === "string" ? body.title.trim() || undefined : undefined,
      subtitle: typeof body.subtitle === "string" ? body.subtitle.trim() || undefined : undefined,
      brandColor: accentColor, textColor: "#241f47", textSafeTreatment, artDirection,
      purpose, ratio, heroAspectRatio, planning: { brief, recipe, assetPlan, gapPlan }, compositionAdvice: assessed.advice,
      assessment: { source: assessed.advice.source, warnings: assessed.advice.warnings }, canvasWidth: W, canvasHeight: H,
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
