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
