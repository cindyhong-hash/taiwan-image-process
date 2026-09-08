import type { LayerData } from "./types.ts";

export type AdLayoutOption = {
  id: string;
  label: string;
  description: string;
  layers: LayerData[];
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
