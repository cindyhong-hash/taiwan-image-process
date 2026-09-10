import type { AdAssetCandidate, AdAssetInventory, AdVisualKitRole } from "./ad-layout-context.ts";
import type { CreativeBrief, DesignRecipe } from "./ad-layout-creative-brief.ts";

export type PlannedAsset = AdAssetCandidate & { reason: string };
export type OmittedAsset = { role: AdVisualKitRole; reason: string };
export type AdLayoutAssetPlan = {
  background?: PlannedAsset;
  product?: PlannedAsset;
  support?: PlannedAsset;
  decorations: PlannedAsset[];
  omitted: OmittedAsset[];
};

export type GapPlanEntry =
  | { kind: "missing-identity-asset"; provider: "user-action"; message: string }
  | { kind: "product-shadow"; provider: "shape"; message: string }
  | { kind: "text-safe-treatment"; provider: "shape"; message: string }
  | { kind: "missing-background"; provider: "image-generation"; role: "background"; label: "情境背景"; message: string }
  | { kind: "missing-detail"; provider: "image-generation"; role: "detail"; label: "質地細節"; message: string }
  | { kind: "missing-benefit"; provider: "image-generation"; role: "benefit"; label: "賣點視覺"; message: string };

export type GeneratableGap = Extract<GapPlanEntry, { provider: "image-generation" }>;

export function isGeneratableGap(gap: GapPlanEntry): gap is GeneratableGap {
  return gap.provider === "image-generation";
}

function planned(asset: AdAssetCandidate | undefined, reason: string): PlannedAsset | undefined {
  return asset ? { ...asset, reason } : undefined;
}

export function planRecipeAssets(
  recipe: DesignRecipe,
  inventory: AdAssetInventory,
  direction?: "product-focus" | "editorial" | "scene-led",
): AdLayoutAssetPlan {
  const product = planned(inventory.byRole.hero, "保留原始去背商品，作為唯一 identity-critical 主體");
  const background = planned(inventory.byRole.background, "使用情境背景提供場景與留白");
  const supportPolicy = direction === "scene-led" && recipe.supportPolicy === "none" ? "one-detail-first" : recipe.supportPolicy;
  const supportCandidate = supportPolicy === "one-benefit-first"
    ? inventory.byRole.benefit ?? inventory.byRole.detail
    : supportPolicy === "one-detail-first"
      ? inventory.byRole.detail ?? inventory.byRole.benefit
      : undefined;
  const support = planned(supportCandidate, supportCandidate?.role === "benefit" ? "以單一賣點視覺支援訊息" : "以單一質地細節支援情境");
  const decoration = planned(inventory.byRole.decoration, "以低存在感裝飾引導視線");
  const omitted: OmittedAsset[] = [];

  for (const role of ["detail", "benefit"] as const) {
    if (!inventory.byRole[role] || support?.role === role) continue;
    omitted.push({ role, reason: "此設計 recipe 不需要第二張輔助視覺，避免素材拼貼" });
  }
  if (!decoration && inventory.byRole.decoration) omitted.push({ role: "decoration", reason: "此 recipe 不使用裝飾" });

  return { background, product, support, decorations: decoration && recipe.maxDecorations > 0 ? [decoration] : [], omitted };
}

export function analyzeDesignGaps(
  brief: CreativeBrief,
  recipe: DesignRecipe,
  inventory: AdAssetInventory,
): GapPlanEntry[] {
  const gaps: GapPlanEntry[] = [];
  const hasHero = Boolean(inventory.byRole.hero);
  if (recipe.productRequired && !hasHero) {
    gaps.push({ kind: "missing-identity-asset", provider: "user-action", message: "缺少去背商品主體，無法建立可靠的產品設計稿" });
  }
  if (recipe.productRequired) {
    gaps.push({ kind: "product-shadow", provider: "shape", message: "使用既有可編輯 shape 建立商品 grounding，不重新生成商品" });
  }
  if (brief.userCopy.headline || brief.userCopy.subtitle) {
    gaps.push({ kind: "text-safe-treatment", provider: "shape", message: "文字區若對比不足，使用可編輯安全底板維持可讀性" });
  }
  if (hasHero && brief.purpose === "scene" && !inventory.byRole.background) {
    gaps.push({ kind: "missing-background", provider: "image-generation", role: "background", label: "情境背景", message: "缺少可合成的情境背景，可選擇建立一張不含商品的背景素材" });
  } else if (hasHero && brief.purpose === "scene" && !inventory.byRole.detail && !inventory.byRole.benefit) {
    gaps.push({ kind: "missing-detail", provider: "image-generation", role: "detail", label: "質地細節", message: "缺少能支援情境的質地細節，可選擇建立一張不含商品的輔助素材" });
  } else if (hasHero && brief.purpose === "benefit" && !inventory.byRole.benefit && !inventory.byRole.detail) {
    gaps.push({ kind: "missing-benefit", provider: "image-generation", role: "benefit", label: "賣點視覺", message: "缺少賣點視覺，可選擇建立一張不含商品的概念素材" });
  }
  return gaps;
}
