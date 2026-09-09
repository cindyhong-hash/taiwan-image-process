import type { AdLayoutDesignSpec } from "./ad-layout-design-spec.ts";

export type AdLayoutQualityCheck = {
  id: "hero-present" | "decoration-budget" | "support-budget" | "direction-support" | "copy-treatment" | "product-aspect";
  passed: boolean;
  message: string;
};

export function validateAdLayoutSpec(spec: AdLayoutDesignSpec): AdLayoutQualityCheck[] {
  const hasCopy = Boolean(spec.typography.headline || spec.typography.subtitle);
  const aspect = spec.productTreatment?.aspectRatio;
  return [
    { id: "hero-present", passed: Boolean(spec.assets.product), message: "設計稿需要一個明確商品主體" },
    { id: "decoration-budget", passed: spec.assets.decorations.length <= 2, message: "裝飾元素不得超過兩個" },
    { id: "support-budget", passed: spec.assets.support === undefined || Boolean(spec.assets.support.imageUrl), message: "最多使用一張有效的輔助視覺" },
    {
      id: "direction-support",
      passed: spec.direction === "scene-led" || spec.purpose === "benefit" || spec.assets.support === undefined,
      message: "只有情境或賣點設計可以使用單一輔助視覺",
    },
    { id: "copy-treatment", passed: !hasCopy || ["none", "light-panel", "dark-panel"].includes(spec.textSafeArea.treatment), message: "有文案時必須有已判定的文字安全處理" },
    { id: "product-aspect", passed: aspect === undefined || (Number.isFinite(aspect) && aspect > 0), message: "商品比例必須有效，才能以 contain 放入模板" },
  ];
}
