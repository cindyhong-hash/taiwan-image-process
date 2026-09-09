import type { LayerData } from "./types.ts";
import type { AdLayoutAssessmentMetadata } from "./ad-layout-vision-policy.ts";

export type AdLayoutOption = {
  id: string;
  label: string;
  description: string;
  layers: LayerData[];
  assessment?: AdLayoutAssessmentMetadata;
  preview?: {
    backgroundUrl: string;
    heroUrl?: string;
    benefitUrl?: string;
    decorationUrl?: string;
    textColor: string;
    accentColor: string;
    purpose?: "product" | "benefit" | "scene" | "promo";
  };
};

export function selectAdLayoutOption(
  options: readonly AdLayoutOption[],
  id: string,
): AdLayoutOption | null {
  return options.find((option) => option.id === id) ?? null;
}

export function previewAssetsForOption(option: AdLayoutOption) {
  const imageFor = (...ids: string[]) => option.layers.find((layer) => ids.includes(layer.id))?.image ?? undefined;
  return {
    backgroundUrl: imageFor("layer_bg"),
    productUrl: imageFor("product_1"),
    supportUrl: imageFor("benefit_1", "texture_1"),
    decorationUrl: imageFor("decoration_1", "decoration_2"),
  };
}

export type AdLayoutPreviewRect = { x: number; y: number; w: number; h: number };
export type AdLayoutPreviewModel = {
  backgroundUrl?: string;
  product?: { imageUrl: string; rect: AdLayoutPreviewRect };
  support?: { imageUrl: string; rect: AdLayoutPreviewRect };
  decoration?: { imageUrl: string; rect: AdLayoutPreviewRect };
  panel?: { kind: "promo" | "safe"; color?: string; rect: AdLayoutPreviewRect };
  headline?: { text: string; color?: string; rect: AdLayoutPreviewRect };
};

function rectFor(layer: LayerData, canvas: { width: number; height: number }): AdLayoutPreviewRect {
  const x = layer.x ?? layer.bbox?.x ?? 0;
  const y = layer.y ?? layer.bbox?.y ?? 0;
  const width = layer.width ?? layer.bbox?.w ?? 0;
  const height = layer.height ?? layer.bbox?.h ?? 0;
  return {
    x: Number((x / canvas.width * 100).toFixed(4)),
    y: Number((y / canvas.height * 100).toFixed(4)),
    w: Number((width / canvas.width * 100).toFixed(4)),
    h: Number((height / canvas.height * 100).toFixed(4)),
  };
}

function firstLayer(option: AdLayoutOption, ...ids: string[]): LayerData | undefined {
  return option.layers.find((layer) => ids.includes(layer.id));
}

export function previewModelForOption(
  option: AdLayoutOption,
  canvas: { width: number; height: number },
): AdLayoutPreviewModel {
  const model: AdLayoutPreviewModel = { backgroundUrl: firstLayer(option, "layer_bg")?.image ?? undefined };
  const product = firstLayer(option, "product_1");
  const support = firstLayer(option, "benefit_1", "texture_1");
  const decoration = firstLayer(option, "decoration_1", "decoration_2");
  const panel = firstLayer(option, "promo_panel", "text_safe_panel");
  const headline = firstLayer(option, "text_title");
  if (product?.image) model.product = { imageUrl: product.image, rect: rectFor(product, canvas) };
  if (support?.image) model.support = { imageUrl: support.image, rect: rectFor(support, canvas) };
  if (decoration?.image) model.decoration = { imageUrl: decoration.image, rect: rectFor(decoration, canvas) };
  if (panel) {
    const shape = panel.meta?.shape as { fill?: unknown } | undefined;
    model.panel = { kind: panel.id === "promo_panel" ? "promo" : "safe", color: typeof shape?.fill === "string" ? shape.fill : undefined, rect: rectFor(panel, canvas) };
  }
  if (headline) {
    const style = headline.meta?.style as { text?: unknown; color?: unknown } | undefined;
    if (typeof style?.text === "string" && style.text.trim()) {
      model.headline = { text: style.text, color: typeof style.color === "string" ? style.color : undefined, rect: rectFor(headline, canvas) };
    }
  }
  return model;
}
