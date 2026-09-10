import type { AdLayoutDirection, AdLayoutPurpose, NormalizedRect, TextSafeZone } from "./ad-layout-design-spec.ts";

export type AdLayoutTemplate = {
  id: string;
  direction: AdLayoutDirection;
  textSafeArea: TextSafeZone;
  zones: {
    text: NormalizedRect;
    hero: NormalizedRect;
    support: NormalizedRect;
    decoration: NormalizedRect;
    logo: NormalizedRect;
    safePanel: NormalizedRect;
  };
};

export const AD_LAYOUT_TEMPLATES: readonly AdLayoutTemplate[] = [
  {
    id: "copy-left-product-right", direction: "product-focus", textSafeArea: "left-top",
    zones: {
      text: { x: 0.07, y: 0.09, w: 0.40, h: 0.30 }, hero: { x: 0.475, y: 0.25, w: 0.50, h: 0.60 },
      support: { x: 0.07, y: 0.60, w: 0.20, h: 0.16 }, decoration: { x: 0.82, y: 0.08, w: 0.11, h: 0.10 },
      logo: { x: 0.07, y: 0.90, w: 0.18, h: 0.055 }, safePanel: { x: 0.045, y: 0.06, w: 0.45, h: 0.36 },
    },
  },
  {
    id: "center-product-bottom-copy", direction: "product-focus", textSafeArea: "left-top",
    zones: {
      text: { x: 0.09, y: 0.07, w: 0.75, h: 0.24 }, hero: { x: 0.24, y: 0.35, w: 0.52, h: 0.56 },
      support: { x: 0.05, y: 0.62, w: 0.16, h: 0.11 }, decoration: { x: 0.80, y: 0.17, w: 0.10, h: 0.09 },
      logo: { x: 0.75, y: 0.91, w: 0.16, h: 0.05 }, safePanel: { x: 0.055, y: 0.05, w: 0.80, h: 0.29 },
    },
  },
  {
    id: "editorial-product-left", direction: "editorial", textSafeArea: "right-top",
    zones: {
      text: { x: 0.58, y: 0.18, w: 0.35, h: 0.35 }, hero: { x: 0.05, y: 0.30, w: 0.50, h: 0.60 },
      support: { x: 0.62, y: 0.65, w: 0.19, h: 0.14 }, decoration: { x: 0.10, y: 0.10, w: 0.10, h: 0.09 },
      logo: { x: 0.70, y: 0.90, w: 0.18, h: 0.05 }, safePanel: { x: 0.54, y: 0.13, w: 0.42, h: 0.42 },
    },
  },
  {
    id: "editorial-product-bottom", direction: "editorial", textSafeArea: "left-top",
    zones: {
      text: { x: 0.09, y: 0.08, w: 0.64, h: 0.25 }, hero: { x: 0.24, y: 0.38, w: 0.52, h: 0.55 },
      support: { x: 0.78, y: 0.58, w: 0.16, h: 0.12 }, decoration: { x: 0.82, y: 0.13, w: 0.10, h: 0.09 },
      logo: { x: 0.09, y: 0.91, w: 0.17, h: 0.05 }, safePanel: { x: 0.06, y: 0.05, w: 0.70, h: 0.32 },
    },
  },
  {
    id: "scene-copy-overlay", direction: "scene-led", textSafeArea: "left-top",
    zones: {
      text: { x: 0.08, y: 0.12, w: 0.38, h: 0.16 }, hero: { x: 0.58, y: 0.53, w: 0.29, h: 0.35 },
      support: { x: 0.08, y: 0.60, w: 0.22, h: 0.15 }, decoration: { x: 0.78, y: 0.30, w: 0.10, h: 0.09 },
      logo: { x: 0.08, y: 0.91, w: 0.17, h: 0.05 }, safePanel: { x: 0.05, y: 0.07, w: 0.45, h: 0.27 },
    },
  },
  {
    id: "scene-product-corner", direction: "scene-led", textSafeArea: "left-center",
    zones: {
      text: { x: 0.08, y: 0.43, w: 0.37, h: 0.17 }, hero: { x: 0.62, y: 0.59, w: 0.251, h: 0.29 },
      support: { x: 0.65, y: 0.15, w: 0.18, h: 0.12 }, decoration: { x: 0.13, y: 0.18, w: 0.10, h: 0.09 },
      logo: { x: 0.08, y: 0.91, w: 0.17, h: 0.05 }, safePanel: { x: 0.05, y: 0.37, w: 0.44, h: 0.29 },
    },
  },
];

export function templateFor(direction: AdLayoutDirection, purpose: AdLayoutPurpose, ratio: string): AdLayoutTemplate {
  const candidates = AD_LAYOUT_TEMPLATES.filter((template) => template.direction === direction);
  const purposeOffset: Record<AdLayoutPurpose, number> = { product: 0, benefit: 1, scene: 0, promo: 1 };
  const ratioOffset = ratio.startsWith("9:") ? 1 : 0;
  return candidates[(purposeOffset[purpose] + ratioOffset) % candidates.length]!;
}

export function templateForAdvice(
  direction: AdLayoutDirection,
  purpose: AdLayoutPurpose,
  ratio: string,
  preferredTextSafeArea?: TextSafeZone,
  composition?: "copy-left" | "copy-right" | "stacked",
): AdLayoutTemplate {
  const advised = preferredTextSafeArea
    ? AD_LAYOUT_TEMPLATES.find((template) => template.direction === direction && template.textSafeArea === preferredTextSafeArea)
    : undefined;
  if (advised) return advised;

  const byComposition: Record<AdLayoutDirection, Record<NonNullable<typeof composition>, string>> = {
    "product-focus": {
      "copy-left": "copy-left-product-right",
      "copy-right": "copy-left-product-right",
      stacked: "center-product-bottom-copy",
    },
    editorial: {
      "copy-left": "editorial-product-bottom",
      "copy-right": "editorial-product-left",
      stacked: "editorial-product-bottom",
    },
    "scene-led": {
      "copy-left": "scene-copy-overlay",
      "copy-right": "scene-product-corner",
      stacked: "scene-product-corner",
    },
  };
  return composition ? templateById(byComposition[direction][composition]) : templateFor(direction, purpose, ratio);
}

export function templateById(id: string): AdLayoutTemplate {
  const template = AD_LAYOUT_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Unknown ad-layout template: ${id}`);
  return template;
}
