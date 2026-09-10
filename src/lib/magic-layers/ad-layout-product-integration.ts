import type { AdLayoutDesignSpec } from "./ad-layout-design-spec.ts";
import type { Bbox } from "./types.ts";

export type ProductIntegrationPlan = {
  mode: "surface" | "floating";
  lightSide: "left" | "right";
  contactShadow: boolean;
  castShadow: boolean;
  highlight: boolean;
  halo: boolean;
  reflectionHighlight: boolean;
};

export type ProductIntegrationGeometry = {
  groundingShadow?: Bbox;
  contactShadow?: Bbox;
  castShadow?: Bbox;
  highlight?: Bbox;
  halo?: Bbox;
  reflectionHighlight?: Bbox;
};

function bounded(rect: Bbox, canvas: AdLayoutDesignSpec["canvas"]): Bbox {
  const w = Math.max(1, Math.min(canvas.width, Math.round(rect.w)));
  const h = Math.max(1, Math.min(canvas.height, Math.round(rect.h)));
  return {
    x: Math.max(0, Math.min(canvas.width - w, Math.round(rect.x))),
    y: Math.max(0, Math.min(canvas.height - h, Math.round(rect.y))),
    w,
    h,
  };
}

export function planProductIntegration(spec: AdLayoutDesignSpec): ProductIntegrationPlan {
  const product = spec.layout?.product;
  const mode = spec.compositionAdvice?.source === "vision" && spec.compositionAdvice.sceneGrounding === "surface"
    ? "surface"
    : "floating";
  if (!product) {
    return {
      mode,
      lightSide: "right",
      contactShadow: false,
      castShadow: false,
      highlight: false,
      halo: false,
      reflectionHighlight: false,
    };
  }
  const lightSide = product.x + product.w / 2 > spec.canvas.width / 2 ? "left" : "right";
  const roomBelow = spec.canvas.height - (product.y + product.h);
  const reflectionHighlight = mode === "surface" && roomBelow >= Math.max(24, product.h * 0.14);

  return {
    mode,
    lightSide,
    contactShadow: mode === "surface",
    castShadow: mode === "surface",
    highlight: true,
    halo: mode === "floating",
    reflectionHighlight,
  };
}

export function resolveProductIntegrationGeometry(
  spec: AdLayoutDesignSpec,
  plan: ProductIntegrationPlan,
): ProductIntegrationGeometry {
  const product = spec.layout?.product;
  if (!product) return {};
  const result: ProductIntegrationGeometry = {};
  const bottom = product.y + product.h;

  if (plan.mode === "floating") {
    result.groundingShadow = bounded({
      x: product.x + product.w * 0.05,
      y: bottom - product.h * 0.02,
      w: product.w * 0.9,
      h: Math.max(12, product.h * 0.12),
    }, spec.canvas);
  }
  if (plan.contactShadow) {
    result.contactShadow = bounded({
      x: product.x + product.w * 0.12,
      y: bottom - product.h * 0.025,
      w: product.w * 0.76,
      h: Math.max(10, product.h * 0.07),
    }, spec.canvas);
  }
  if (plan.castShadow) {
    const offset = plan.lightSide === "left" ? product.w * 0.18 : -product.w * 0.18;
    result.castShadow = bounded({
      x: product.x + offset,
      y: product.y + product.h * 0.18,
      w: product.w * 0.88,
      h: product.h * 0.7,
    }, spec.canvas);
  }
  if (plan.highlight) {
    result.highlight = bounded({
      x: plan.lightSide === "left" ? product.x - product.w * 0.07 : product.x + product.w * 0.84,
      y: product.y + product.h * 0.08,
      w: product.w * 0.23,
      h: product.h * 0.72,
    }, spec.canvas);
  }
  if (plan.halo) {
    result.halo = bounded({
      x: product.x - product.w * 0.13,
      y: product.y - product.h * 0.06,
      w: product.w * 1.26,
      h: product.h * 1.1,
    }, spec.canvas);
  }
  if (plan.reflectionHighlight) {
    result.reflectionHighlight = bounded({
      x: product.x + product.w * 0.18,
      y: bottom + product.h * 0.025,
      w: product.w * 0.64,
      h: Math.max(8, product.h * 0.1),
    }, spec.canvas);
  }

  return result;
}
