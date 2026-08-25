/* ============================================================
   Magic Layers — generate unified layer data from grouped objects + text.
   ONE complete semantic object => ONE layer (never one-per-fragment).
   ============================================================ */
import type { GroupedObject, ClassifiedText, LayerData, Mask, LayerType, SemanticId } from "./types.ts";
import { bbox, rectPolygon, iou } from "./geometry.ts";
import { typeName } from "./semantic-grouper.ts";

function semanticIdOf(t: LayerType): SemanticId {
  return t === "independent_text" ? "text" : t;
}

/** Drop near-duplicate text boxes (the VLM often returns several overlapping
 *  boxes for one title -> stacked blocks). Keep the highest-confidence of any
 *  heavily-overlapping cluster; distinct, non-overlapping titles are preserved. */
function dedupeText(texts: ClassifiedText[], minIoU = 0.5): ClassifiedText[] {
  const kept: ClassifiedText[] = [];
  for (const t of [...texts].sort((a, b) => b.confidence - a.confidence)) {
    if (!kept.some(k => iou(k.bbox, t.bbox) >= minIoU)) kept.push(t);
  }
  return kept;
}

export function generateLayers(
  objects: GroupedObject[],
  texts: ClassifiedText[],
  imageSize: { width: number; height: number },
): LayerData[] {
  const layers: LayerData[] = [];
  let z = 0;
  const instanceCount: Record<string, number> = {};
  const nextInstance = (sem: string) => `${sem}_${(instanceCount[sem] = (instanceCount[sem] ?? 0) + 1)}`;

  // Background straight from the original pixels.
  const fullBox = bbox(0, 0, imageSize.width, imageSize.height);
  const bgMask: Mask = { kind: "rect", bbox: fullBox, polygons: [rectPolygon(fullBox)] };
  layers.push({
    id: "layer_bg", type: "background", name: "Background",
    semanticId: "background", instanceId: "background_1", parentId: null,
    bbox: fullBox, mask: bgMask, image: null,
    x: 0, y: 0, width: imageSize.width, height: imageSize.height, rotation: 0,
    zIndex: z++, confidence: 1, source: "original", editable: true,
    embeddedText: [], children: [], meta: {},
  });

  // One layer per grouped object; embedded text rides along.
  for (const o of objects) {
    const sem = semanticIdOf(o.type);
    const instanceId = o.instanceId ?? nextInstance(sem);
    const embedded = texts
      .filter(t => t.ownership === "embedded" && t.ownerObjectId === o.id)
      .map(({ id, text, bbox: b, confidence }) => ({ id, text, bbox: b, confidence }));
    layers.push({
      id: o.id, type: o.type, name: `${typeName(o.type)} ${instanceNumber(instanceId)}`,
      semanticId: sem, instanceId, parentId: null,
      bbox: o.bbox, mask: o.mask, image: o.mask.alphaUrl ?? null,   // ONE merged cut-out
      x: o.bbox.x, y: o.bbox.y, width: o.bbox.w, height: o.bbox.h, rotation: 0,
      zIndex: z++, confidence: o.confidence, source: "segmented", editable: true,
      embeddedText: embedded,
      children: o.parts.map(p => p.id),   // LayerGroup: fragments live under the object
      meta: { partLabels: o.parts.map(p => p.label) },
    });
  }

  // Independent text -> real editable text layers (deduped so overlapping
  // VLM boxes don't stack into blocks).
  for (const t of dedupeText(texts.filter(t => t.ownership === "independent"))) {
    layers.push({
      id: `txt_${t.id}`, type: "independent_text", name: shorten(t.text),
      semanticId: "text", instanceId: nextInstance("text"), parentId: null,
      bbox: t.bbox, mask: null, image: null,
      x: t.bbox.x, y: t.bbox.y, width: t.bbox.w, height: t.bbox.h, rotation: 0,
      zIndex: z++, confidence: t.confidence, source: "ocr", editable: true,
      embeddedText: [], children: [], meta: { textObject: t },
    });
  }

  return layers;
}

function instanceNumber(instanceId: string): string { const m = instanceId.match(/_(\d+)$/); return m ? m[1] : "1"; }
function shorten(s: string, n = 16): string { s = (s || "Text").trim(); return s.length > n ? s.slice(0, n) + "…" : s; }
