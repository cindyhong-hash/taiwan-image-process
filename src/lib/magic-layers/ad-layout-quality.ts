import type { AdLayoutDesignSpec } from "./ad-layout-design-spec.ts";

export type AdLayoutQualityCheck = {
  id: "hero-present" | "decoration-budget" | "support-budget" | "direction-support" | "copy-treatment" | "product-aspect" | "product-bounds" | "product-integration" | "product-copy-overlap";
  passed: boolean;
  message: string;
};

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function validateAdLayoutSpec(spec: AdLayoutDesignSpec): AdLayoutQualityCheck[] {
  const hasCopy = Boolean(spec.typography.headline || spec.typography.subtitle);
  const aspect = spec.productTreatment?.aspectRatio;
  const product = spec.layout?.product;
  const productInBounds = !spec.assets.product || Boolean(
    product && product.w > 0 && product.h > 0 && product.x >= 0 && product.y >= 0 &&
    product.x + product.w <= spec.canvas.width && product.y + product.h <= spec.canvas.height,
  );
  const integration = spec.productIntegration;
  const hasVisibleIntegration = !spec.assets.product || Boolean(
    integration?.highlight && (integration.halo || integration.contactShadow || integration.castShadow),
  );
  const copyRects = [
    spec.typography.headline ? spec.layout?.headline : undefined,
    spec.typography.subtitle ? spec.layout?.subtitle : undefined,
  ].filter((rect): rect is NonNullable<typeof rect> => Boolean(rect && rect.w > 0 && rect.h > 0));
  const copySeparate = !spec.assets.product || !product || copyRects.every((rect) => !overlaps(product, rect));
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
    { id: "product-bounds", passed: productInBounds, message: "商品主體必須完整位於畫布範圍內" },
    { id: "product-integration", passed: hasVisibleIntegration, message: "商品主體需要可編輯的光影或 grounding 才能融入畫面" },
    { id: "product-copy-overlap", passed: copySeparate, message: "商品主體不得與標題或副標重疊" },
  ];
}
