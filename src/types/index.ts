export type LayoutType = "A" | "B" | "C";

export type TextZone = "top-left" | "top-full" | "top-center" | "bottom-full" | "none";

export type LayoutConfig = {
  type: LayoutType;
  label: string;
  description: string;
  compositionPrompt: string;
  textZone: TextZone;
};

export const LAYOUT_CONFIGS: LayoutConfig[] = [
  {
    type: "A",
    label: "產品置中",
    description: "產品置中，文案下方，清晰展示",
    compositionPrompt: `Shooting style: clean product photography on a natural surface (stone, marble, or wood). Soft diffused light from upper-left, warm golden hour tone. Color grade: slightly warm, slightly desaturated, high-end editorial — think Jo Malone or Aesop campaign. Captured on 85mm f/1.4 equivalent.`,
    textZone: "top-left",
  },
  {
    type: "B",
    label: "視覺強烈",
    description: "產品偏右，文案左側大字，設計感強",
    compositionPrompt: `Shooting style: dynamic, high-contrast, asymmetric composition with strong directional light. Deep shadows, saturated background field on one side. Energy: kinetic and bold, like a Shiseido ULTIMUNE or Nike campaign. Dramatic side lighting with bold cast shadows.`,
    textZone: "top-full",
  },
  {
    type: "C",
    label: "氣氛感",
    description: "產品滿版背景，文案疊加，品牌形象",
    compositionPrompt: `Shooting style: atmospheric editorial with heavy background bokeh. Warm lifestyle props (flowers, branches, linen, aged wood surface). Magazine editorial quality — Vogue Living or ELLE Decoration aesthetic. Soft directional natural light, warm whites and blush tones.`,
    textZone: "top-center",
  },
];
