import type { AdAssetInventory, AdLayoutContext } from "./ad-layout-context.ts";

export type AdDesignPurpose = "product" | "benefit" | "scene" | "promo";
export type DesignRecipeId = "product-hero" | "editorial" | "lifestyle" | "benefit-focus" | "promotion";
export type SupportPolicy = "none" | "one-detail-first" | "one-benefit-first";

export type CreativeBrief = {
  purpose: AdDesignPurpose;
  ratio: string;
  product: AdLayoutContext["product"];
  brand: AdLayoutContext["brand"];
  inventory: AdAssetInventory;
  userCopy: { headline?: string; subtitle?: string };
};

export type DesignRecipe = {
  id: DesignRecipeId;
  supportPolicy: SupportPolicy;
  productRequired: boolean;
  maxDecorations: number;
  principles: string[];
};

function clean(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function createCreativeBrief(
  context: AdLayoutContext,
  request: { purpose: AdDesignPurpose; ratio: string; title?: string; subtitle?: string },
): CreativeBrief {
  return {
    purpose: request.purpose,
    ratio: request.ratio,
    product: context.product,
    brand: context.brand,
    inventory: context.inventory,
    userCopy: { headline: clean(request.title), subtitle: clean(request.subtitle) },
  };
}

export function selectDesignRecipe(brief: CreativeBrief): DesignRecipe {
  switch (brief.purpose) {
    case "benefit":
      return {
        id: "benefit-focus", supportPolicy: "one-benefit-first", productRequired: true, maxDecorations: 1,
        principles: ["商品維持唯一主體", "以一張賣點視覺補充功效", "避免將質地與賣點一起堆入畫面"],
      };
    case "scene":
      return {
        id: "lifestyle", supportPolicy: "one-detail-first", productRequired: true, maxDecorations: 1,
        principles: ["情境背景先建立氛圍", "商品收束焦點", "只允許一張輔助視覺"],
      };
    case "promo":
      return {
        id: "promotion", supportPolicy: "none", productRequired: true, maxDecorations: 1,
        principles: ["優惠訊息需有清楚層級", "商品保持辨識度", "避免輔助素材干擾促銷資訊"],
      };
    case "product":
    default:
      return {
        id: "product-hero", supportPolicy: "none", productRequired: true, maxDecorations: 1,
        principles: ["商品是第一視覺焦點", "文字是第二層級", "素材保持克制"],
      };
  }
}
