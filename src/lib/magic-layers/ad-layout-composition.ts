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
  if (input.benefits?.length) { heroZone.h = Math.min(heroZone.h, Math.round(H * 0.72) - heroZone.y); w = Math.round(Math.min(heroZone.w, heroZone.h * aspect)); h = Math.round(w / aspect); }
  const product = { x: Math.round(heroZone.x + (heroZone.w - w) / 2), y: Math.round(heroZone.y + (heroZone.h - h) / 2), w, h };
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
