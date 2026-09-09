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
  | { kind: "text-safe-treatment"; provider: "shape"; message: string };

function planned(asset: AdAssetCandidate | undefined, reason: string): PlannedAsset | undefined {
  return asset ? { ...asset, reason } : undefined;
}

export function planRecipeAssets(recipe: DesignRecipe, inventory: AdAssetInventory): AdLayoutAssetPlan {
  const product = planned(inventory.byRole.hero, "保留原始去背商品，作為唯一 identity-critical 主體");
  const background = planned(inventory.byRole.background, "使用情境背景提供場景與留白");
  const supportCandidate = recipe.supportPolicy === "one-benefit-first"
    ? inventory.byRole.benefit ?? inventory.byRole.detail
    : recipe.supportPolicy === "one-detail-first"
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
  if (recipe.productRequired && !inventory.byRole.hero) {
    gaps.push({ kind: "missing-identity-asset", provider: "user-action", message: "缺少去背商品主體，無法建立可靠的產品設計稿" });
  }
  if (recipe.productRequired) {
    gaps.push({ kind: "product-shadow", provider: "shape", message: "使用既有可編輯 shape 建立商品 grounding，不重新生成商品" });
  }
  if (brief.userCopy.headline || brief.userCopy.subtitle) {
    gaps.push({ kind: "text-safe-treatment", provider: "shape", message: "文字區若對比不足，使用可編輯安全底板維持可讀性" });
  }
  return gaps;
}
