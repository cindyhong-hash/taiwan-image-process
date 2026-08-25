/* ============================================================
   Magic Layers — Text ownership (embedded vs independent vs unknown)
   Port of the verified classifier, now classifying against GROUPED objects.
   Fuses bbox overlap + mask/containment + object relationship + spatial gap.
   Never guesses: conflicting/weak evidence -> unknown.
   ============================================================ */
import type { RawText, ClassifiedText, GroupedObject } from "./types.ts";
import { containedFraction, center, pointInBbox, clearance, clamp01 } from "./geometry.ts";

const OWNER_TYPES = ["product", "person", "object"];
export const OWNERSHIP_DEFAULTS = {
  embedContain: 0.6,
  independentContain: 0.15,
  minObjectConf: 0.45,
  ambiguityGap: 0.2,
  nearClearanceFrac: 0.02,
};

export function classifyText(
  t: RawText,
  objects: GroupedObject[],
  imageSize: { width: number; height: number },
  opts: Partial<typeof OWNERSHIP_DEFAULTS> = {},
): ClassifiedText {
  const cfg = { ...OWNERSHIP_DEFAULTS, ...opts };
  const diag = Math.hypot(imageSize.width, imageSize.height) || 1;
  const c = center(t.bbox);
  const owners = objects.filter(o => OWNER_TYPES.includes(o.type));

  const scored = owners.map(o => ({
    o,
    contain: containedFraction(t.bbox, o.bbox),
    inside: pointInBbox(c, o.bbox),
    clear: clearance(t.bbox, o.bbox) / diag,
  })).sort((a, b) => b.contain - a.contain);

  const best = scored[0], second = scored[1];
  const mk = (ownership: ClassifiedText["ownership"], ownerId: string | null, conf: number, reasons: string[]): ClassifiedText => ({
    ...t, ownership, ownerObjectId: ownership === "embedded" ? ownerId : null,
    confidence: clamp01(conf), editable: ownership === "independent",
    reasons,
  });

  // Step 9: trust the vision model's text role first; geometry is the fallback.
  const INDEP_ROLES = ["headline", "price", "badge", "cta", "body_copy"];
  const EMBED_ROLES = ["package_logo", "package_text"];
  if (t.role && INDEP_ROLES.includes(t.role)) return mk("independent", null, t.confidence, [`role=${t.role}`]);
  if (t.role && EMBED_ROLES.includes(t.role)) {
    if (best && (best.inside || best.contain > 0.1)) return mk("embedded", best.o.id, Math.max(t.confidence, 0.85), [`role=${t.role} on ${best.o.type}`]);
    return mk("unknown", best?.o.id ?? null, 0.5, [`role=${t.role} but no object overlaps`]);
  }

  if (!best || (best.contain <= 0 && !best.inside)) {
    return mk("independent", null, t.confidence * 0.9, ["no object overlaps this text"]);
  }
  if (second && best.contain > cfg.independentContain && second.contain > cfg.independentContain &&
      Math.abs(best.contain - second.contain) < cfg.ambiguityGap) {
    return mk("unknown", null, 0.4, ["two objects overlap the text similarly"]);
  }
  const strong = best.contain >= cfg.embedContain;
  if (best.inside || strong) {
    if (best.o.confidence < cfg.minObjectConf) return mk("unknown", best.o.id, 0.5, ["object detection too weak to trust embedding"]);
    return mk("embedded", best.o.id, clamp01(0.5 + 0.5 * best.contain) * best.o.confidence,
      [`${Math.round(best.contain * 100)}% of text sits on the ${best.o.type}`]);
  }
  if (best.contain <= cfg.independentContain && best.clear > cfg.nearClearanceFrac) {
    return mk("independent", null, clamp01(0.7 + (1 - best.contain) * 0.3) * t.confidence, ["text is clear of every object"]);
  }
  return mk("unknown", best.o.id, 0.45, ["partial overlap is inconclusive"]);
}

export function classifyAllText(texts: RawText[], objects: GroupedObject[], imageSize: { width: number; height: number }): ClassifiedText[] {
  return texts.map(t => classifyText(t, objects, imageSize));
}
