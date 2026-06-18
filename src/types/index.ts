export type LayoutType = "A" | "B" | "C";

export type LayoutConfig = {
  type: LayoutType;
  label: string;
  description: string;
  compositionPrompt: string;
};

export const LAYOUT_CONFIGS: LayoutConfig[] = [
  {
    type: "A",
    label: "產品置中",
    description: "產品置中，文案下方，清晰展示",
    compositionPrompt: "product centered, text below, clean product showcase",
  },
  {
    type: "B",
    label: "視覺強烈",
    description: "產品偏右，文案左側大字，設計感強",
    compositionPrompt: "product on right side, large bold text on left, strong visual design",
  },
  {
    type: "C",
    label: "氣氛感",
    description: "產品滿版背景，文案疊加，品牌形象",
    compositionPrompt: "product as full-bleed background, text overlay, atmospheric brand feel",
  },
];
