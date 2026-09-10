import { fitText } from "./editable-text.ts";
import { templateForAdvice } from "./ad-layout-templates.ts";
import type { DirectionDecision } from "./ad-layout-art-direction.ts";
import type { AdLayoutDesignInput, AdLayoutDirection } from "./ad-layout-design-spec.ts";
export type LayoutRect = { x: number; y: number; w: number; h: number };
export type ResolvedAdLayout = {
  templateId: string; product: LayoutRect; headline: LayoutRect; subtitle: LayoutRect;
  safePanel: LayoutRect; support: LayoutRect; decoration: LayoutRect; logo: LayoutRect;
  headlineSize: number; subtitleSize: number;
};
export class CopyTooLongError extends Error { constructor() { super("文案較長，請縮短標題或副標後再試"); } }

/** 貼齊檯面後至少要保留原尺寸的這個比例，否則不貼。 */
const MIN_GROUNDED_AREA_RATIO = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function alignProductToSurface(
  product: LayoutRect,
  aspect: number,
  input: AdLayoutDesignInput,
): LayoutRect {
  const advice = input.compositionAdvice;
  const surface = advice?.source === "vision" && advice.sceneGrounding === "surface"
    ? advice.surfaceRect
    : undefined;
  if (!surface) return product;

  const { width: canvasWidth, height: canvasHeight } = input.canvas;
  const surfaceLeft = Math.round(surface.x * canvasWidth);
  const surfaceTop = Math.round(surface.y * canvasHeight);
  const surfaceWidth = Math.round(surface.w * canvasWidth);
  const maxWidth = Math.max(1, Math.round(surfaceWidth * 0.62));
  const maxHeight = Math.max(1, surfaceTop - Math.round(canvasHeight * 0.08));
  const scale = Math.min(1, maxWidth / product.w, maxHeight / product.h);

  let w: number;
  let h: number;
  if (aspect >= 1) {
    w = Math.max(1, Math.round(product.w * scale));
    h = Math.max(1, Math.round(w / aspect));
    if (h > maxHeight) {
      h = maxHeight;
      w = Math.max(1, Math.round(h * aspect));
    }
  } else {
    h = Math.max(1, Math.round(product.h * scale));
    w = Math.max(1, Math.round(h * aspect));
    if (w > maxWidth) {
      w = maxWidth;
      h = Math.max(1, Math.round(w / aspect));
    }
  }

  // 檯面偵測到得越高，上方可站立的空間越少，商品就被壓得越小 ——
  // 檯面在畫面上緣時甚至會退化成 1px。貼齊只是加分項，不值得為它輸出一張
  // 看不到商品的圖：縮太多就整個放棄貼齊，退回原本的浮空排版。
  if (w * h < product.w * product.h * MIN_GROUNDED_AREA_RATIO) return product;

  const minCenter = surfaceLeft + w / 2;
  const maxCenter = surfaceLeft + surfaceWidth - w / 2;
  const originalCenter = product.x + product.w / 2;
  const center = clamp(originalCenter, minCenter, Math.max(minCenter, maxCenter));
  return {
    x: Math.round(center - w / 2),
    y: surfaceTop - h,
    w,
    h,
  };
}

export function resolveAdComposition(input: AdLayoutDesignInput, direction: AdLayoutDirection, decision?: DirectionDecision): ResolvedAdLayout {
  const { width: W, height: H } = input.canvas;
  const unit = Math.min(W, H);
  const rect = (x: number, y: number, w: number, h: number): LayoutRect => ({ x: Math.round(x * W), y: Math.round(y * H), w: Math.round(w * W), h: Math.round(h * H) });
  const aspect = input.productAspectRatio && Number.isFinite(input.productAspectRatio) && input.productAspectRatio > 0 ? input.productAspectRatio : 0.65;
  const template = templateForAdvice(
    direction,
    input.purpose,
    input.canvas.ratio,
    input.compositionAdvice?.preferredTextSafeArea,
    decision?.composition,
  );
  const zone = (value: { x: number; y: number; w: number; h: number }) => rect(value.x, value.y, value.w, value.h);
  const copy = zone(template.zones.text);
  const heroZone = zone(template.zones.hero);
  let w = Math.min(heroZone.w, heroZone.h * aspect), h = w / aspect;
  w = Math.round(w); h = Math.round(h);
  if (input.benefits?.length) {
    // 賣點列畫在 y=0.77，所以限制其實是「商品底部要在它上面」。
    // 原本只把 hero 區塊壓扁，對起點本來就低的 scene-led 版型（y=0.53 / 0.59）
    // 等於只剩 0.13–0.19 個畫布高，商品縮到畫布的 1.7%，等於白給一個選項。
    // 先把區塊往上移來滿足限制，真的還不夠才縮 —— 上移不用犧牲尺寸。
    const limit = Math.round(H * 0.72);
    const topMargin = Math.round(H * 0.08);
    if (heroZone.y + heroZone.h > limit) {
      heroZone.y = Math.max(topMargin, limit - heroZone.h);
      heroZone.h = Math.min(heroZone.h, limit - heroZone.y);
    }
    w = Math.round(Math.min(heroZone.w, heroZone.h * aspect));
    h = Math.round(w / aspect);
  }
  const product = alignProductToSurface(
    { x: Math.round(heroZone.x + (heroZone.w - w) / 2), y: Math.round(heroZone.y + (heroZone.h - h) / 2), w, h },
    aspect,
    input,
  );
  const hasTitle = Boolean(input.typography.headline);
  const hasSub = Boolean(input.typography.subtitle);
  const gap = Math.round(unit * 0.018);
  const titleMaxH = hasSub ? copy.h * 0.66 : copy.h;
  const headlineScale = decision?.typography === "quiet" ? 0.9 : decision?.typography === "bold" ? 1.06 : 1;
  const title = fitText(input.typography.headline ?? "", copy.w, titleMaxH, unit * 0.035, unit * (direction === "editorial" ? 0.068 : 0.076) * headlineScale);
  const titleH = hasTitle ? Math.ceil(title.lines.length * title.fontSize * 1.25) : 0;
  const sub = fitText(input.typography.subtitle ?? "", copy.w, copy.h - titleH - (hasTitle && hasSub ? gap : 0), unit * 0.022, unit * 0.029);
  if (!title.fits || !sub.fits) throw new CopyTooLongError();
  const headline = { ...copy, h: titleH };
  const subtitle = { ...copy, y: copy.y + (hasTitle ? titleH + gap : 0), h: Math.ceil(sub.lines.length * sub.fontSize * 1.25) };
  return {
    templateId: template.id, product, headline, subtitle, headlineSize: title.fontSize, subtitleSize: sub.fontSize,
    safePanel: zone(template.zones.safePanel),
    support: zone(template.zones.support),
    decoration: zone(template.zones.decoration),
    logo: zone(template.zones.logo),
  };
}
