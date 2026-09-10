import type { AdLayoutDesignSpec } from "./ad-layout-design-spec.ts";
import type { LayoutRect } from "./ad-layout-composition.ts";

const MAX_PRODUCT_SCALE = 1.08;
const MAX_HEADLINE_SCALE = 1.08;

function overlaps(a: LayoutRect, b: LayoutRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function hasArea(rect: LayoutRect | undefined): rect is LayoutRect {
  return Boolean(rect && rect.w > 0 && rect.h > 0);
}

function insideCanvas(rect: LayoutRect, canvas: AdLayoutDesignSpec["canvas"]): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= canvas.width && rect.y + rect.h <= canvas.height;
}

function scaleFromCenter(rect: LayoutRect, scale: number, aspectRatio?: number): LayoutRect {
  let w = Math.round(rect.w * scale);
  let h = Math.round(rect.h * scale);
  if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
    if (aspectRatio >= 1) h = Math.round(w / aspectRatio);
    else w = Math.round(h * aspectRatio);
  }
  return {
    x: Math.round(rect.x - (w - rect.w) / 2),
    y: Math.round(rect.y - (h - rect.h) / 2),
    w,
    h,
  };
}

function canGrowProduct(spec: AdLayoutDesignSpec, candidate: LayoutRect): boolean {
  if (!spec.layout || !insideCanvas(candidate, spec.canvas)) return false;
  const protectedRects = [spec.layout.headline, spec.layout.subtitle, spec.layout.support].filter(hasArea);
  return protectedRects.every((rect) => !overlaps(candidate, rect));
}

/**
 * 商品是不是真的站在偵測到的檯面上（底部貼齊檯面上緣）。
 * 只看 surfaceRect 有沒有值是不夠的 —— 貼齊可能因為會把商品壓太小而被放棄，
 * 那種情況要讓下面的放大修補照常運作，否則就沒有任何東西擋得住過小的商品。
 */
function isGroundedOnSurface(spec: AdLayoutDesignSpec): boolean {
  const advice = spec.compositionAdvice;
  if (!spec.layout || advice?.source !== "vision" || advice.sceneGrounding !== "surface" || !advice.surfaceRect) return false;
  const surfaceTop = Math.round(advice.surfaceRect.y * spec.canvas.height);
  return Math.abs(spec.layout.product.y + spec.layout.product.h - surfaceTop) <= 1;
}

function isProductUndersized(spec: AdLayoutDesignSpec): boolean {
  if (!spec.layout) return false;
  // 已經貼齊檯面就不要再放大，放大會讓商品浮起來離開檯面。
  if (isGroundedOnSurface(spec)) return false;
  const canvasArea = spec.canvas.width * spec.canvas.height;
  const productArea = spec.layout.product.w * spec.layout.product.h;
  return canvasArea > 0 && productArea / canvasArea < 0.22;
}

function isShortHeadline(headline: string | undefined): boolean {
  return Boolean(headline && Array.from(headline.trim()).length > 0 && Array.from(headline.trim()).length <= 12);
}

function appendDecision(spec: AdLayoutDesignSpec, reason: string): void {
  spec.rationale.push(reason);
  spec.quality.warnings.push(reason);
  spec.polishTreatment.reasons.push(reason);
}

export function polishAdLayoutSpec(source: AdLayoutDesignSpec): AdLayoutDesignSpec {
  const spec: AdLayoutDesignSpec = {
    ...source,
    layout: source.layout ? {
      ...source.layout,
      product: { ...source.layout.product },
      headline: { ...source.layout.headline },
      subtitle: { ...source.layout.subtitle },
      safePanel: { ...source.layout.safePanel },
      support: { ...source.layout.support },
      decoration: { ...source.layout.decoration },
      logo: { ...source.layout.logo },
    } : undefined,
    assets: { ...source.assets, decorations: [...source.assets.decorations] },
    typography: { ...source.typography },
    rationale: [...source.rationale],
    quality: { ...source.quality, warnings: [...source.quality.warnings], checks: [...source.quality.checks] },
    polishTreatment: { backgroundWash: "none", reasons: [] },
  };

  if (!spec.layout) return spec;

  if (isProductUndersized(spec)) {
    const grown = scaleFromCenter(spec.layout.product, MAX_PRODUCT_SCALE, spec.productTreatment?.aspectRatio);
    if (canGrowProduct(spec, grown)) {
      spec.layout.product = grown;
      appendDecision(spec, "商品主體在安全範圍內放大 8%，加強視覺焦點");
    }
  }

  if (spec.typography.headlineWeight === 700 && isShortHeadline(spec.typography.headline)) {
    const currentSize = spec.layout.headlineSize;
    const nextSize = Math.min(Math.round(currentSize * 1.06), currentSize * MAX_HEADLINE_SCALE);
    if (nextSize > currentSize && Math.ceil(nextSize * 1.25) <= spec.layout.headline.h) {
      spec.layout.headlineSize = nextSize;
      spec.typography.headlineWeight = 800;
      appendDecision(spec, "短標題已在原文字框內加大並加粗，提升訊息層級");
    }
  }

  if (spec.assets.decorations.length > 0) {
    const collisionTargets = [spec.layout.product, spec.layout.headline, spec.layout.subtitle].filter(hasArea);
    if (collisionTargets.some((rect) => overlaps(spec.layout!.decoration, rect))) {
      spec.assets.decorations = [];
      appendDecision(spec, "裝飾與商品或文案碰撞，已移除裝飾避免干擾");
    }
  }

  if (spec.assets.background && spec.direction !== "scene-led" && spec.textSafeArea.treatment !== "none") {
    spec.polishTreatment.backgroundWash = "soft-light";
    appendDecision(spec, "背景加入低透明度可編輯柔光，降低對主體與文案的干擾");
  }

  return spec;
}
