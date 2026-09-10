import type { BenefitInput } from "./ad-layout-graphics.ts";
import type { DirectionDecision } from "./ad-layout-art-direction.ts";
import { resolveAdComposition, type ResolvedAdLayout } from "./ad-layout-composition.ts";
import { templateForAdvice } from "./ad-layout-templates.ts";
import type { CreativeBrief, DesignRecipe } from "./ad-layout-creative-brief.ts";
import { planRecipeAssets, type AdLayoutAssetPlan, type GapPlanEntry } from "./ad-layout-gap-analysis.ts";
import { validateAdLayoutSpec, type AdLayoutQualityCheck } from "./ad-layout-quality.ts";
import type { AdLayoutCompositionAdvice } from "./ad-layout-vision-policy.ts";

export type AdLayoutPurpose = "product" | "benefit" | "scene" | "promo";
export type AdLayoutDirection = "product-focus" | "editorial" | "scene-led";
export type AdAssetRole = "hero" | "detail" | "background" | "benefit" | "decoration";
export type TextSafeTreatment = "none" | "light-panel" | "dark-panel";
export type TextSafeZone = "left-top" | "left-center" | "right-top" | "bottom";
export type NormalizedRect = { x: number; y: number; w: number; h: number };

export interface AssetSelection { role: AdAssetRole; imageUrl: string; }
export interface AdLayoutAssetPool { hero?: string; detail?: string; background?: string; benefit?: string; decoration?: string; }
export interface AdLayoutTypographyInput {
  headline?: string;
  subtitle?: string;
  dark: string;
  light: string;
  accent: string;
  treatment?: TextSafeTreatment | Partial<Record<AdLayoutDirection, TextSafeTreatment>>;
}
export interface AdLayoutDesignInput {
  canvas: { width: number; height: number; ratio: string };
  assets: AdLayoutAssetPool;
  purpose: AdLayoutPurpose;
  typography: AdLayoutTypographyInput;
  layouts?: Partial<Record<AdLayoutDirection, ResolvedAdLayout>>;
  textColors?: Partial<Record<AdLayoutDirection, string>>;
  benefits?: BenefitInput[];
  directionDecisions?: Partial<Record<AdLayoutDirection, DirectionDecision>>;
  secondaryAccent?: string;
  artDirection?: string;
  productAspectRatio?: number;
  planning?: { brief: CreativeBrief; recipe: DesignRecipe; assetPlan: AdLayoutAssetPlan; gapPlan: GapPlanEntry[] };
  compositionAdvice?: AdLayoutCompositionAdvice;
}
export interface AdLayoutDesignSpec {
  benefits?: BenefitInput[];
  artDirectionDecision?: DirectionDecision;
  direction: AdLayoutDirection;
  purpose: AdLayoutPurpose;
  templateId: string;
  layout?: ResolvedAdLayout;
  artDirection: string;
  creativeBrief?: CreativeBrief;
  recipe?: DesignRecipe;
  assetPlan?: AdLayoutAssetPlan;
  gapPlan?: GapPlanEntry[];
  compositionAdvice?: AdLayoutCompositionAdvice;
  rationale: string[];
  canvas: { width: number; height: number; ratio: string };
  assets: { background?: AssetSelection; product?: AssetSelection; support?: AssetSelection; decorations: AssetSelection[] };
  textSafeArea: { zone: TextSafeZone; treatment: TextSafeTreatment };
  typography: { headline?: string; subtitle?: string; headlineColor: string; subtitleColor: string; accentColor: string; headlineWeight: 700 | 800; subtitleWeight: 500 | 600; };
  productTreatment?: { shadow: "none" | "soft-ellipse"; aspectRatio?: number };
  quality: { score: number; warnings: string[]; checks: AdLayoutQualityCheck[] };
}

function selected(role: AdAssetRole, imageUrl?: string): AssetSelection | undefined {
  return imageUrl ? { role, imageUrl } : undefined;
}

function assetPlan(direction: AdLayoutDirection, purpose: AdLayoutPurpose, assets: AdLayoutAssetPool): AdLayoutDesignSpec["assets"] {
  const background = selected("background", assets.background);
  const product = selected("hero", assets.hero);
  const decoration = selected("decoration", assets.decoration);
  const shouldUseSupport = direction === "scene-led" || purpose === "benefit";
  const support = shouldUseSupport
    ? selected(purpose === "benefit" && assets.benefit ? "benefit" : "detail", purpose === "benefit" && assets.benefit ? assets.benefit : assets.detail)
    : undefined;
  return { background, product, support, decorations: decoration ? [decoration] : [] };
}

function selectionsFromPlan(plan: AdLayoutAssetPlan): AdLayoutDesignSpec["assets"] {
  return {
    background: plan.background ? { role: "background", imageUrl: plan.background.imageUrl } : undefined,
    product: plan.product ? { role: "hero", imageUrl: plan.product.imageUrl } : undefined,
    support: plan.support && (plan.support.role === "detail" || plan.support.role === "benefit")
      ? { role: plan.support.role, imageUrl: plan.support.imageUrl }
      : undefined,
    decorations: plan.decorations.map((decoration) => ({ role: "decoration" as const, imageUrl: decoration.imageUrl })),
  };
}

function rationaleFor(direction: AdLayoutDirection, assets: AdLayoutDesignSpec["assets"]): string[] {
  const base = direction === "product-focus"
    ? "以單一商品主體建立明確視覺焦點"
    : direction === "editorial"
      ? "以留白與文字節奏建立品牌質感"
      : "以情境背景帶出使用時刻，再以商品收束畫面";
  const omitted = assets.support ? "只使用一個輔助視覺，避免素材拼貼" : "省略輔助素材，維持乾淨層級";
  return [base, omitted];
}

export function validateAndRepairDesignSpec(spec: AdLayoutDesignSpec, available: AdLayoutAssetPool): AdLayoutDesignSpec {
  const warnings = [...spec.quality.warnings];
  const assets = { ...spec.assets, decorations: spec.assets.decorations.slice(0, 2) };
  if (spec.assets.decorations.length > assets.decorations.length) warnings.push("裝飾元素超過上限，已保留前兩個");
  if (!assets.product && available.hero) {
    assets.product = { role: "hero", imageUrl: available.hero };
    warnings.push("已補回商品主體，維持主視覺層級");
  }
  const repaired = { ...spec, assets };
  const checks = validateAdLayoutSpec(repaired);
  const failed = checks.filter((check) => !check.passed);
  return { ...repaired, quality: { score: Math.max(0, 100 - warnings.length * 8 - failed.length * 15), warnings: [...warnings, ...failed.map((check) => check.message)], checks } };
}

export function resolveAdLayoutDesignSpecs(input: AdLayoutDesignInput): AdLayoutDesignSpec[] {
  const directions: AdLayoutDirection[] = ["product-focus", "editorial", "scene-led"];
  return directions.map((direction) => {
    const directionDecision = input.directionDecisions?.[direction];
    const template = templateForAdvice(direction, input.purpose, input.canvas.ratio, input.compositionAdvice?.preferredTextSafeArea);
    const directionalPlan = input.planning
      ? planRecipeAssets(input.planning.recipe, input.planning.brief.inventory, direction)
      : undefined;
    const assets = directionalPlan ? selectionsFromPlan(directionalPlan) : assetPlan(direction, input.purpose, input.assets);
    if (input.benefits?.length || directionDecision?.support === "none") assets.support = undefined;
    if (directionDecision?.support === "detail" && input.assets.detail) assets.support = selected("detail", input.assets.detail);
    if (directionDecision?.support === "benefit" && input.assets.benefit) assets.support = selected("benefit", input.assets.benefit);
    if (directionDecision?.decoration === "none") assets.decorations = [];
    const treatment = typeof input.typography.treatment === "string"
      ? input.typography.treatment
      : input.typography.treatment?.[direction] ?? "none";
    const useLightText = treatment === "dark-panel";
    const color = input.textColors?.[direction] ?? (useLightText ? input.typography.light : input.typography.dark);
    const spec: AdLayoutDesignSpec = {
      direction,
      benefits: directionDecision ? directionDecision.graphics === "benefit-group" ? input.benefits : undefined : input.benefits,
      artDirectionDecision: directionDecision,
      purpose: input.purpose,
      templateId: template.id,
      layout: input.layouts?.[direction] ?? resolveAdComposition(input, direction, directionDecision),
      artDirection: input.artDirection ?? "以品牌調性完成乾淨、清楚的產品社群設計",
      creativeBrief: input.planning?.brief,
      recipe: input.planning?.recipe,
      assetPlan: directionalPlan ?? input.planning?.assetPlan,
      gapPlan: input.planning?.gapPlan,
      compositionAdvice: input.compositionAdvice,
      rationale: rationaleFor(direction, assets),
      canvas: input.canvas,
      assets,
      textSafeArea: { zone: template.textSafeArea, treatment },
      typography: {
        headline: input.typography.headline,
        subtitle: input.typography.subtitle,
        headlineColor: color,
        subtitleColor: color,
        accentColor: directionDecision?.accent === "secondary" && input.secondaryAccent ? input.secondaryAccent : input.typography.accent,
        headlineWeight: directionDecision?.typography === "quiet" || direction === "editorial" ? 700 : 800,
        subtitleWeight: 500,
      },
      productTreatment: assets.product ? {
        shadow: direction === "scene-led" && input.compositionAdvice?.sceneGrounding !== "surface" ? "none" : "soft-ellipse",
        aspectRatio: input.productAspectRatio && Number.isFinite(input.productAspectRatio) && input.productAspectRatio > 0 ? input.productAspectRatio : undefined,
      } : undefined,
      quality: { score: 100, warnings: [...(input.compositionAdvice?.warnings ?? [])], checks: [] },
    };
    return validateAndRepairDesignSpec(spec, input.assets);
  });
}
