import { templateById } from "./ad-layout-templates.ts";
import type { AdLayoutDesignSpec, NormalizedRect } from "./ad-layout-design-spec.ts";
import type { Bbox, LayerData, SemanticId } from "./types.ts";

export type AdLayoutRenderOptions = { logoUrl?: string };

function box(rect: NormalizedRect, width: number, height: number): Bbox {
  return { x: Math.round(rect.x * width), y: Math.round(rect.y * height), w: Math.round(rect.w * width), h: Math.round(rect.h * height) };
}

function imageLayer(
  id: string,
  name: string,
  zIndex: number,
  image: string,
  rect: Bbox,
  type: LayerData["type"],
  semanticId: SemanticId,
  opacity = 1,
): LayerData {
  return {
    id, name, type, semanticId, instanceId: id, parentId: null, bbox: rect, mask: null, image,
    x: rect.x, y: rect.y, width: rect.w, height: rect.h, rotation: 0, zIndex, confidence: 1,
    source: "generated", editable: true, embeddedText: [], children: [], meta: { opacity },
  };
}

function shapeLayer(id: string, name: string, zIndex: number, rect: Bbox, fill: string, opacity: number, kind: "rect" | "ellipse"): LayerData {
  return {
    id, name, type: "object", semanticId: "object", instanceId: id, parentId: null, bbox: rect, mask: null, image: null,
    x: rect.x, y: rect.y, width: rect.w, height: rect.h, rotation: 0, zIndex, confidence: 1,
    source: "generated", editable: true, embeddedText: [], children: [],
    meta: { opacity, shape: { kind, fill, stroke: "none", strokeWidth: 0, radius: kind === "rect" ? Math.round(Math.min(rect.w, rect.h) * 0.1) : 0 } },
  };
}

function textLayer(id: "text_title" | "text_sub", zIndex: number, text: string, rect: Bbox, color: string, fontWeight: number, align: "left" | "center"): LayerData {
  return {
    id, name: text.slice(0, 14) || "Text", type: "independent_text", semanticId: "text", instanceId: id, parentId: null,
    bbox: rect, mask: null, image: null, x: rect.x, y: rect.y, width: rect.w, height: rect.h, rotation: 0,
    zIndex, confidence: 1, source: "generated", editable: true, embeddedText: [], children: [],
    meta: {
      textObject: { text },
      style: {
        text, color, fontWeight, align, fontSizePx: Math.max(18, Math.round(rect.h * (id === "text_title" ? 0.78 : 0.58))),
        fontFamily: "'Noto Sans TC','PingFang TC',system-ui,sans-serif",
      },
    },
  };
}

export function renderAdLayoutSpec(spec: AdLayoutDesignSpec, options: AdLayoutRenderOptions = {}): LayerData[] {
  const template = templateById(spec.templateId);
  const { width, height } = spec.canvas;
  const layers: LayerData[] = [];
  let zIndex = 0;

  if (spec.assets.background) {
    layers.push(imageLayer("layer_bg", "情境背景", zIndex++, spec.assets.background.imageUrl, { x: 0, y: 0, w: width, h: height }, "background", "background"));
  }
  if (spec.assets.support) {
    const id = spec.assets.support.role === "benefit" ? "benefit_1" : "texture_1";
    const label = spec.assets.support.role === "benefit" ? "賣點視覺" : "質地細節";
    layers.push(imageLayer(id, label, zIndex++, spec.assets.support.imageUrl, box(template.zones.support, width, height), "object", "object", 0.82));
  }
  if (spec.assets.product && spec.productTreatment?.shadow === "soft-ellipse") {
    const product = box(template.zones.hero, width, height);
    const shadow: Bbox = {
      x: Math.round(product.x + product.w * 0.15), y: Math.round(product.y + product.h * 0.82),
      w: Math.round(product.w * 0.7), h: Math.max(12, Math.round(product.h * 0.10)),
    };
    layers.push(shapeLayer("product_shadow", "商品柔和投影", zIndex++, shadow, "#24364a", 0.16, "ellipse"));
  }
  if (spec.assets.product) {
    layers.push(imageLayer("product_1", "商品主體", zIndex++, spec.assets.product.imageUrl, box(template.zones.hero, width, height), "product", "product"));
  }
  spec.assets.decorations.forEach((decoration, index) => {
    layers.push(imageLayer(`decoration_${index + 1}`, "裝飾元素", zIndex++, decoration.imageUrl, box(template.zones.decoration, width, height), "decoration", "decoration", 0.72));
  });
  if (spec.purpose === "promo" && (spec.typography.headline || spec.typography.subtitle)) {
    layers.push(shapeLayer("promo_panel", "優惠文字底板", zIndex++, box(template.zones.safePanel, width, height), spec.typography.accentColor, 0.96, "rect"));
  }
  if (spec.textSafeArea.treatment !== "none" && (spec.typography.headline || spec.typography.subtitle)) {
    const fill = spec.textSafeArea.treatment === "light-panel" ? "#ffffff" : "#111827";
    layers.push(shapeLayer("text_safe_panel", "文字安全底板", zIndex++, box(template.zones.safePanel, width, height), fill, 0.52, "rect"));
  }
  const textRect = box(template.zones.text, width, height);
  const align = template.textSafeArea === "right-top" ? "right" : "left";
  const headlineColor = spec.purpose === "promo" ? "#ffffff" : spec.typography.headlineColor;
  const subtitleColor = spec.purpose === "promo" ? "#ffffff" : spec.typography.subtitleColor;
  if (spec.typography.headline) {
    const headlineRect = { ...textRect, h: Math.round(textRect.h * 0.58) };
    layers.push(textLayer("text_title", zIndex++, spec.typography.headline, headlineRect, headlineColor, spec.typography.headlineWeight, align));
  }
  if (spec.typography.subtitle) {
    const subtitleRect = { ...textRect, y: textRect.y + Math.round(textRect.h * 0.62), h: Math.round(textRect.h * 0.30) };
    layers.push(textLayer("text_sub", zIndex++, spec.typography.subtitle, subtitleRect, subtitleColor, spec.typography.subtitleWeight, align));
  }
  if (options.logoUrl) {
    layers.push(imageLayer("logo_1", "品牌 Logo", zIndex++, options.logoUrl, box(template.zones.logo, width, height), "object", "object"));
  }
  return layers;
}
