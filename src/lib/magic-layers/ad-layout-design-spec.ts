import { templateFor } from "./ad-layout-templates.ts";

export type AdLayoutPurpose = "product" | "benefit" | "scene" | "promo";
export type AdLayoutDirection = "product-focus" | "editorial" | "scene-led";
export type AdAssetRole = "hero" | "detail" | "background" | "benefit" | "decoration";
export type TextSafeTreatment = "none" | "light-panel" | "dark-panel";
export type TextSafeZone = "left-top" | "left-center" | "right-top" | "bottom";
export type NormalizedRect = { x: number; y: number; w: number; h: number };

export interface AssetSelection { role: AdAssetRole; imageUrl: string; }
export interface AdLayoutAssetPool { hero?: string; detail?: string; background?: string; benefit?: string; decoration?: string; }
export interface AdLayoutTypographyInput { headline?: string; subtitle?: string; dark: string; light: string; accent: string; treatment?: TextSafeTreatment; }
export interface AdLayoutDesignInput {
  canvas: { width: number; height: number; ratio: string };
  assets: AdLayoutAssetPool;
  purpose: AdLayoutPurpose;
  typography: AdLayoutTypographyInput;
  artDirection?: string;
}
export interface AdLayoutDesignSpec {
  direction: AdLayoutDirection;
  purpose: AdLayoutPurpose;
  templateId: string;
  artDirection: string;
  rationale: string[];
  canvas: { width: number; height: number; ratio: string };
  assets: { background?: AssetSelection; product?: AssetSelection; support?: AssetSelection; decorations: AssetSelection[] };
  textSafeArea: { zone: TextSafeZone; treatment: TextSafeTreatment };
  typography: { headline?: string; subtitle?: string; headlineColor: string; subtitleColor: string; accentColor: string; headlineWeight: 700 | 800; subtitleWeight: 500 | 600; };
  productTreatment?: { shadow: "none" | "soft-ellipse" };
  quality: { score: number; warnings: string[] };
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
  return { ...spec, assets, quality: { score: Math.max(0, 100 - warnings.length * 8), warnings } };
}

export function resolveAdLayoutDesignSpecs(input: AdLayoutDesignInput): AdLayoutDesignSpec[] {
  const directions: AdLayoutDirection[] = ["product-focus", "editorial", "scene-led"];
  return directions.map((direction) => {
    const template = templateFor(direction, input.purpose, input.canvas.ratio);
    const assets = assetPlan(direction, input.purpose, input.assets);
    const useLightText = input.typography.treatment === "dark-panel";
    const color = useLightText ? input.typography.light : input.typography.dark;
    const spec: AdLayoutDesignSpec = {
      direction,
      purpose: input.purpose,
      templateId: template.id,
      artDirection: input.artDirection ?? "以品牌調性完成乾淨、清楚的產品社群設計",
      rationale: rationaleFor(direction, assets),
      canvas: input.canvas,
      assets,
      textSafeArea: { zone: template.textSafeArea, treatment: input.typography.treatment ?? "none" },
      typography: {
        headline: input.typography.headline,
        subtitle: input.typography.subtitle,
        headlineColor: color,
        subtitleColor: color,
        accentColor: input.typography.accent,
        headlineWeight: direction === "editorial" ? 700 : 800,
        subtitleWeight: 500,
      },
      productTreatment: assets.product ? { shadow: direction === "scene-led" ? "none" : "soft-ellipse" } : undefined,
      quality: { score: 100, warnings: [] },
    };
    return validateAndRepairDesignSpec(spec, input.assets);
  });
}
