import { matchBenefitGraphic } from "./ad-layout-graphics.ts";
import { fitText } from "./editable-text.ts";
import { CopyTooLongError } from "./ad-layout-composition.ts";
import { DEFAULT_TEXT_LAYOUT } from "./editable-text.ts";
import { templateById } from "./ad-layout-templates.ts";
import { planProductIntegration, resolveProductIntegrationGeometry } from "./ad-layout-product-integration.ts";
import type { AdLayoutDesignSpec, NormalizedRect } from "./ad-layout-design-spec.ts";
import type { Bbox, LayerData, SemanticId } from "./types.ts";

export type AdLayoutRenderOptions = { logoUrl?: string };

function box(rect: NormalizedRect, width: number, height: number): Bbox {
  return { x: Math.round(rect.x * width), y: Math.round(rect.y * height), w: Math.round(rect.w * width), h: Math.round(rect.h * height) };
}

function fitAspectWithin(container: Bbox, aspectRatio: number | undefined): Bbox {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return container;
  const containerAspect = container.w / container.h;
  if (aspectRatio >= containerAspect) {
    const height = Math.round(container.w / aspectRatio);
    return { x: container.x, y: Math.round(container.y + (container.h - height) / 2), w: container.w, h: height };
  }
  const width = Math.round(container.h * aspectRatio);
  return { x: Math.round(container.x + (container.w - width) / 2), y: container.y, w: width, h: container.h };
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

function shapeLayer(
  id: string,
  name: string,
  zIndex: number,
  rect: Bbox,
  fill: string,
  opacity: number,
  kind: "rect" | "ellipse",
  type: LayerData["type"] = "object",
  semanticId: SemanticId = "object",
): LayerData {
  return {
    id, name, type, semanticId, instanceId: id, parentId: null, bbox: rect, mask: null, image: null,
    x: rect.x, y: rect.y, width: rect.w, height: rect.h, rotation: 0, zIndex, confidence: 1,
    source: "generated", editable: true, embeddedText: [], children: [],
    meta: { opacity, shape: { ...(id === "product_shadow" ? { softness: 0.9 } : {}), kind, fill, stroke: "none", strokeWidth: 0, radius: kind === "rect" ? Math.round(Math.min(rect.w, rect.h) * 0.1) : 0 } },
  };
}

function textLayer(id: "text_title" | "text_sub", zIndex: number, text: string, rect: Bbox, color: string, fontWeight: number, align: "left" | "center" | "right", fontSize?: number): LayerData {
  return {
    id, name: text.slice(0, 14) || "Text", type: "independent_text", semanticId: "text", instanceId: id, parentId: null,
    bbox: rect, mask: null, image: null, x: rect.x, y: rect.y, width: rect.w, height: rect.h, rotation: 0,
    zIndex, confidence: 1, source: "generated", editable: true, embeddedText: [], children: [],
    meta: {
      textObject: { text },
      style: {
        text, color, fontWeight, align, ...(fontSize ? { layout: { ...DEFAULT_TEXT_LAYOUT } } : {}), fontSizePx: fontSize ?? Math.max(18, Math.round(rect.h * (id === "text_title" ? 0.78 : 0.58))),
        fontFamily: "'Noto Sans TC','PingFang TC',system-ui,sans-serif",
      },
    },
  };
}

export function renderAdLayoutSpec(spec: AdLayoutDesignSpec, options: AdLayoutRenderOptions = {}): LayerData[] {
  const template = templateById(spec.templateId);
  const { width, height } = spec.canvas;
  const layout = spec.layout;
  const layers: LayerData[] = [];
  let zIndex = 0;

  if (spec.assets.background) {
    layers.push(imageLayer("layer_bg", "情境背景", zIndex++, spec.assets.background.imageUrl, { x: 0, y: 0, w: width, h: height }, "background", "background"));
  } else {
    const background = shapeLayer(
      "background_base",
      "背景底色",
      zIndex++,
      { x: 0, y: 0, w: width, h: height },
      "#f8f9fc",
      1,
      "rect",
      "background",
      "background",
    );
    background.meta.shape = { kind: "rect", fill: "#f8f9fc", stroke: "none", strokeWidth: 0, radius: 0 };
    layers.push(background);
  }
  if (spec.polishTreatment?.backgroundWash === "soft-light") {
    const wash = shapeLayer(
      "background_wash",
      "背景柔光",
      zIndex++,
      { x: 0, y: 0, w: width, h: height },
      "#ffffff",
      0.24,
      "rect",
      "background",
      "background",
    );
    wash.meta.shape = {
      kind: "rect",
      fill: "#ffffff",
      stroke: "none",
      strokeWidth: 0,
      radius: 0,
      gradient: { axis: "vertical", from: "#ffffffb8", to: "#ffffff1f" },
    };
    layers.push(wash);
  }
  if (spec.assets.support) {
    const id = spec.assets.support.role === "benefit" ? "benefit_1" : "texture_1";
    const label = spec.assets.support.role === "benefit" ? "賣點視覺" : "質地細節";
    layers.push(imageLayer(id, label, zIndex++, spec.assets.support.imageUrl, layout?.support ?? box(template.zones.support, width, height), "object", "object", 0.82));
  }
  if (spec.assets.product) {
    const integration = spec.productIntegration ?? planProductIntegration(spec);
    const geometry = resolveProductIntegrationGeometry(spec, integration);
    if (geometry.halo) {
      const halo = shapeLayer("product_color_halo", "商品品牌光暈", zIndex++, geometry.halo, spec.typography.accentColor, 0.14, "ellipse");
      halo.meta.shape = { kind: "ellipse", fill: spec.typography.accentColor, stroke: "none", strokeWidth: 0, softness: 0.95 };
      layers.push(halo);
    }
    if (geometry.castShadow) {
      const cast = shapeLayer("product_cast_shadow", "商品方向投影", zIndex++, geometry.castShadow, "#1f2937", 0.13, "ellipse");
      cast.rotation = integration.lightSide === "left" ? 8 : -8;
      cast.meta.shape = { kind: "ellipse", fill: "#1f2937", stroke: "none", strokeWidth: 0, softness: 0.92 };
      layers.push(cast);
    }
    if (geometry.groundingShadow) {
      const grounding = shapeLayer("product_grounding_shadow", "商品懸浮底影", zIndex++, geometry.groundingShadow, "#24364a", 0.14, "ellipse");
      grounding.meta.shape = { kind: "ellipse", fill: "#24364a", stroke: "none", strokeWidth: 0, softness: 0.9 };
      layers.push(grounding);
    }
    if (geometry.contactShadow) {
      const contact = shapeLayer("product_contact_shadow", "商品接觸陰影", zIndex++, geometry.contactShadow, "#1f2937", 0.2, "ellipse");
      contact.meta.shape = { kind: "ellipse", fill: "#1f2937", stroke: "none", strokeWidth: 0, softness: 0.78 };
      layers.push(contact);
    }
    if (geometry.reflectionHighlight) {
      const reflection = shapeLayer("product_reflection_highlight", "商品表面反光", zIndex++, geometry.reflectionHighlight, "#ffffff", 0.14, "rect");
      reflection.meta.shape = {
        kind: "rect", fill: "#ffffff", stroke: "none", strokeWidth: 0, radius: 0,
        gradient: { axis: "vertical", from: "#ffffff70", to: "#ffffff00" }, softness: 0.72,
      };
      layers.push(reflection);
    }
    if (geometry.highlight) {
      const highlight = shapeLayer("product_highlight", "商品側光", zIndex++, geometry.highlight, "#ffffff", 0.18, "ellipse");
      highlight.meta.shape = { kind: "ellipse", fill: "#ffffff", stroke: "none", strokeWidth: 0, softness: 0.86 };
      layers.push(highlight);
    }
  }
  if (spec.assets.product) {
    const product = layout?.product ?? fitAspectWithin(box(template.zones.hero, width, height), spec.productTreatment?.aspectRatio);
    layers.push(imageLayer("product_1", "商品主體", zIndex++, spec.assets.product.imageUrl, product, "product", "product"));
  }
  spec.assets.decorations.forEach((decoration, index) => {
    layers.push(imageLayer(`decoration_${index + 1}`, "裝飾元素", zIndex++, decoration.imageUrl, layout?.decoration ?? box(template.zones.decoration, width, height), "decoration", "decoration", 0.72));
  });
  if (spec.artDirectionDecision && spec.artDirectionDecision.backdrop !== "none" && (spec.typography.headline || spec.typography.subtitle)) {
    const light = spec.artDirectionDecision.backdrop === "light-fade";
    const backdrop = shapeLayer("art_direction_backdrop", "文字漸層底板", zIndex++, layout?.safePanel ?? box(template.zones.safePanel, width, height), light ? "#ffffff" : "#111827", 0.72, "rect");
    backdrop.meta.shape = {
      kind: "rect", fill: light ? "#ffffff" : "#111827", stroke: "none", strokeWidth: 0,
      gradient: { axis: "vertical", from: light ? "#ffffffee" : "#111827dd", to: light ? "#ffffff00" : "#11182700" },
    };
    layers.push(backdrop);
  }
  if (spec.purpose === "promo" && (spec.typography.headline || spec.typography.subtitle)) {
    layers.push(shapeLayer("promo_panel", "優惠文字底板", zIndex++, layout?.safePanel ?? box(template.zones.safePanel, width, height), spec.typography.accentColor, 0.96, "rect"));
  }
  if (spec.textSafeArea.treatment !== "none" && (spec.typography.headline || spec.typography.subtitle)) {
    const fill = spec.textSafeArea.treatment === "light-panel" ? "#ffffff" : "#111827";
    layers.push(shapeLayer("text_safe_panel", "文字安全底板", zIndex++, layout?.safePanel ?? box(template.zones.safePanel, width, height), fill, 0.52, "rect"));
  }
  const textRect = box(template.zones.text, width, height);
  const align = template.textSafeArea === "right-top" ? "right" : "left";
  const headlineColor = spec.purpose === "promo" ? "#ffffff" : spec.typography.headlineColor;
  const subtitleColor = spec.purpose === "promo" ? "#ffffff" : spec.typography.subtitleColor;
  if (spec.typography.headline) {
    const headlineRect = layout?.headline ?? { ...textRect, h: Math.round(textRect.h * 0.58) };
    layers.push(textLayer("text_title", zIndex++, spec.typography.headline, headlineRect, headlineColor, spec.typography.headlineWeight, align, layout?.headlineSize));
  }
  if (spec.typography.subtitle) {
    const subtitleRect = layout?.subtitle ?? { ...textRect, y: textRect.y + Math.round(textRect.h * 0.62), h: Math.round(textRect.h * 0.30) };
    layers.push(textLayer("text_sub", zIndex++, spec.typography.subtitle, subtitleRect, subtitleColor, spec.typography.subtitleWeight, align, layout?.subtitleSize));
  }
  if (spec.benefits?.length) {
    const n = spec.benefits.length, cellW = width * 0.86 / n, unit = Math.min(width,height);
    spec.benefits.forEach((benefit,i) => {
      const x = width*0.07+i*cellW, y=height*0.77, icon=matchBenefitGraphic(benefit).icon;
      const groupId=`benefit_group_${benefit.id}`;
      if(icon) {
        const size=Math.round(unit*0.045), rect={x:Math.round(x),y:Math.round(y),w:size,h:size};
        const graphic=shapeLayer(`graphic_${benefit.id}`,"賣點圖示",zIndex++,rect,spec.typography.accentColor,1,"rect");
        graphic.meta.shape={kind:"icon",icon,fill:spec.typography.accentColor,stroke:"none",strokeWidth:0};graphic.meta.groupId=groupId;layers.push(graphic);
      }
      const rect={x:Math.round(x),y:Math.round(y+unit*0.055),w:Math.floor(cellW-unit*0.02),h:Math.floor(height*0.075)};
      const fitted=fitText(benefit.text,rect.w,rect.h,unit*0.018,unit*0.024);
      if(!fitted.fits)throw new CopyTooLongError();
      const label=textLayer("text_sub",zIndex++,benefit.text,rect,spec.typography.subtitleColor,500,"left",fitted.fontSize);
      label.id=`benefit_text_${benefit.id}`;label.instanceId=label.id;label.meta.groupId=groupId;layers.push(label);
    });
  }
  if (options.logoUrl) {
    layers.push(imageLayer("logo_1", "品牌 Logo", zIndex++, options.logoUrl, layout?.logo ?? box(template.zones.logo, width, height), "object", "object"));
  }
  return layers;
}
