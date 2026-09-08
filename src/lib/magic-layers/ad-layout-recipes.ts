import type { Bbox, LayerData, SemanticId } from "./types.ts";

export type AdLayoutPurpose = "product" | "benefit" | "scene" | "promo";
export type AdLayoutCandidateId = "product-focus" | "editorial" | "scene-led";

export interface AdLayoutInput {
  backgroundUrl: string;
  heroUrl?: string;
  decorationUrl?: string;
  textureUrl?: string;
  benefitUrl?: string;
  logoUrl?: string;
  title?: string;
  subtitle?: string;
  brandColor?: string;
  textColor?: string;
  purpose?: AdLayoutPurpose;
  canvasWidth: number;
  canvasHeight: number;
}

export interface AdLayoutCandidate {
  id: AdLayoutCandidateId;
  label: string;
  description: string;
  layers: LayerData[];
}

type Rect = { x: number; y: number; w: number; h: number };
type Recipe = Pick<AdLayoutCandidate, "id" | "label" | "description"> & {
  title: Rect;
  subtitle: Rect;
  product: Rect;
  texture: Rect;
  benefit: Rect;
  decoration: Rect;
  logo: Rect;
};

const RECIPES: Recipe[] = [
  {
    id: "product-focus", label: "商品主視覺", description: "商品大幅呈現，資訊集中在乾淨留白區。",
    title: { x: 0.07, y: 0.10, w: 0.39, h: 0.10 }, subtitle: { x: 0.07, y: 0.22, w: 0.35, h: 0.055 },
    product: { x: 0.48, y: 0.30, w: 0.44, h: 0.57 }, texture: { x: 0.06, y: 0.70, w: 0.22, h: 0.18 },
    benefit: { x: 0.04, y: 0.34, w: 0.34, h: 0.28 }, decoration: { x: 0.73, y: 0.05, w: 0.20, h: 0.16 }, logo: { x: 0.74, y: 0.90, w: 0.18, h: 0.06 },
  },
  {
    id: "editorial", label: "編輯留白感", description: "像雜誌跨頁般以文字與材質建立節奏。",
    title: { x: 0.55, y: 0.38, w: 0.36, h: 0.12 }, subtitle: { x: 0.56, y: 0.52, w: 0.30, h: 0.06 },
    product: { x: 0.12, y: 0.34, w: 0.40, h: 0.54 }, texture: { x: 0.06, y: 0.80, w: 0.27, h: 0.14 },
    benefit: { x: 0.58, y: 0.08, w: 0.32, h: 0.23 }, decoration: { x: 0.07, y: 0.08, w: 0.17, h: 0.14 }, logo: { x: 0.72, y: 0.89, w: 0.18, h: 0.06 },
  },
  {
    id: "scene-led", label: "情境氛圍感", description: "讓情境背景先說話，再以商品完成畫面。",
    title: { x: 0.08, y: 0.57, w: 0.38, h: 0.10 }, subtitle: { x: 0.08, y: 0.69, w: 0.34, h: 0.055 },
    product: { x: 0.54, y: 0.46, w: 0.34, h: 0.42 }, texture: { x: 0.68, y: 0.12, w: 0.20, h: 0.14 },
    benefit: { x: 0.06, y: 0.10, w: 0.28, h: 0.20 }, decoration: { x: 0.79, y: 0.34, w: 0.14, h: 0.12 }, logo: { x: 0.08, y: 0.90, w: 0.18, h: 0.06 },
  },
];

function box(rect: Rect, W: number, H: number): Bbox {
  return { x: Math.round(rect.x * W), y: Math.round(rect.y * H), w: Math.round(rect.w * W), h: Math.round(rect.h * H) };
}

function imageLayer(id: string, name: string, zIndex: number, image: string, rect: Bbox, semanticId: SemanticId, opacity = 1): LayerData {
  return {
    id, type: semanticId === "product" ? "product" : "object", name, semanticId, instanceId: id, parentId: null,
    bbox: rect, mask: null, image, x: rect.x, y: rect.y, width: rect.w, height: rect.h, rotation: 0,
    zIndex, confidence: 1, source: "generated", editable: true, embeddedText: [], children: [], meta: { opacity },
  };
}

function textLayer(id: string, zIndex: number, text: string, rect: Bbox, color: string, align: "left" | "center" | "right" = "left"): LayerData {
  return {
    id, type: "independent_text", name: text.slice(0, 14) || "Text", semanticId: "text", instanceId: id, parentId: null,
    bbox: rect, mask: null, image: null, x: rect.x, y: rect.y, width: rect.w, height: rect.h, rotation: 0,
    zIndex, confidence: 1, source: "generated", editable: true, embeddedText: [], children: [],
    meta: { textObject: { text }, style: { text, fontSizePx: Math.round(rect.h * 0.76), fontWeight: id === "text_title" ? 800 : 600, color, align, fontFamily: "'Noto Sans TC','PingFang TC',system-ui,sans-serif" } },
  };
}

function panelLayer(rect: Bbox, zIndex: number, color: string): LayerData {
  return {
    id: "promo_panel", type: "object", name: "優惠文字底板", semanticId: "object", instanceId: "promo_panel", parentId: null,
    bbox: rect, mask: null, image: null, x: rect.x, y: rect.y, width: rect.w, height: rect.h, rotation: 0,
    zIndex, confidence: 1, source: "generated", editable: true, embeddedText: [], children: [],
    meta: { shape: { kind: "rect", fill: color, stroke: "none", strokeWidth: 0, radius: Math.round(Math.min(rect.w, rect.h) * 0.12) } },
  };
}

function purposeRects(recipe: Recipe, purpose: AdLayoutPurpose): Pick<Recipe, "title" | "subtitle" | "product" | "benefit"> {
  if (purpose === "benefit") return {
    title: { x: 0.08, y: 0.10, w: 0.42, h: 0.11 }, subtitle: { x: 0.08, y: 0.23, w: 0.36, h: 0.06 },
    product: { x: 0.57, y: 0.55, w: 0.30, h: 0.32 }, benefit: { x: 0.06, y: 0.30, w: 0.52, h: 0.40 },
  };
  if (purpose === "scene") return {
    title: { x: 0.08, y: 0.10, w: 0.42, h: 0.10 }, subtitle: { x: 0.08, y: 0.22, w: 0.35, h: 0.055 },
    product: { x: 0.56, y: 0.52, w: 0.31, h: 0.36 }, benefit: recipe.benefit,
  };
  if (purpose === "promo") return {
    title: { x: 0.08, y: 0.105, w: 0.46, h: 0.10 }, subtitle: { x: 0.08, y: 0.215, w: 0.40, h: 0.055 },
    product: { x: 0.52, y: 0.35, w: 0.40, h: 0.52 }, benefit: recipe.benefit,
  };
  return recipe;
}

export function buildAdLayoutCandidates(input: AdLayoutInput): AdLayoutCandidate[] {
  const W = input.canvasWidth;
  const H = input.canvasHeight;
  const purpose = input.purpose ?? "product";
  const brandColor = input.brandColor ?? "#6d4aff";
  const baseTextColor = input.textColor ?? "#241f47";

  return RECIPES.map((recipe) => {
    const layout = purposeRects(recipe, purpose);
    const titleColor = purpose === "promo" ? "#ffffff" : baseTextColor;
    const subtitleColor = purpose === "promo" ? "#ffffff" : baseTextColor;
    const layers: LayerData[] = [
      imageLayer("layer_bg", "情境背景", 0, input.backgroundUrl, { x: 0, y: 0, w: W, h: H }, "background"),
    ];
    let z = 1;
    if (input.benefitUrl) layers.push(imageLayer("benefit_1", "賣點視覺", z++, input.benefitUrl, box(layout.benefit, W, H), "object", purpose === "benefit" ? 0.85 : 0.42));
    if (input.textureUrl) layers.push(imageLayer("texture_1", "質地細節", z++, input.textureUrl, box(recipe.texture, W, H), "object"));
    if (input.heroUrl) layers.push(imageLayer("product_1", "商品主體", z++, input.heroUrl, box(layout.product, W, H), "product"));
    if (input.decorationUrl) layers.push(imageLayer("decoration_1", "裝飾元素", z++, input.decorationUrl, box(recipe.decoration, W, H), "decoration", 0.85));
    if (purpose === "promo") layers.push(panelLayer({ x: Math.round(W * 0.045), y: Math.round(H * 0.065), w: Math.round(W * 0.52), h: Math.round(H * 0.235) }, z++, brandColor));
    if (input.title) layers.push(textLayer("text_title", z++, input.title, box(layout.title, W, H), titleColor));
    if (input.subtitle) layers.push(textLayer("text_sub", z++, input.subtitle, box(layout.subtitle, W, H), subtitleColor));
    if (input.logoUrl) layers.push(imageLayer("logo_1", "品牌 Logo", z++, input.logoUrl, box(recipe.logo, W, H), "object"));
    return { id: recipe.id, label: recipe.label, description: recipe.description, layers };
  });
}
