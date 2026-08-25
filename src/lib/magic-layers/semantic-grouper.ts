/* ============================================================
   Magic Layers — SemanticObjectGrouper  (fixes fragmentation)

   Turns raw detector regions (which MAY be fragments: head, hair, arm, cap,
   label…) into COMPLETE semantic objects — one movable thing each.

   Grouping signals, in priority order:
     1. instanceId          — authoritative. Same id => same object; different
                              non-null ids => NEVER merged (two people stay two).
     2. semantic class      — only regions of the SAME type ever merge, so a
                              product held in a hand (person vs product) stays split.
     3. spatial overlap/IoU — geometry fallback only when instanceId is absent.
     4. containment         — a small part sitting inside a larger same-type region.
     5. adjacency/clearance — touching same-type fragments.

   Masks are UNIONed (many part-polygons -> one contour), never left as separate
   rectangles. A real alpha contour is filled in later by the MaskProvider.
   ============================================================ */
import type { Region, GroupedObject, Mask, LayerType } from "./types.ts";
import { unionBbox, iou, containedFraction, clearance, rectPolygon } from "./geometry.ts";
import { unionMasks } from "./mask-unioner.ts";

export interface GrouperOptions {
  minIoU: number;         // same-type regions with IoU above this merge
  minContain: number;     // ...or where one covers this fraction of the other
  adjacencyFrac: number;  // ...or sit within this fraction of the image diagonal
}
export const GROUPER_DEFAULTS: GrouperOptions = { minIoU: 0.05, minContain: 0.6, adjacencyFrac: 0.02 };

export function groupObjects(
  regions: Region[],
  imageSize: { width: number; height: number },
  opts?: Partial<GrouperOptions>,
): GroupedObject[] {
  const cfg = { ...GROUPER_DEFAULTS, ...(opts ?? {}) };
  const diag = Math.hypot(imageSize.width, imageSize.height) || 1;
  const n = regions.length;

  // union-find
  const parent = regions.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i: number, j: number) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b; };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (shouldMerge(regions[i], regions[j], cfg, diag)) union(i, j);
    }
  }

  // collect sets
  const sets = new Map<number, Region[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!sets.has(r)) sets.set(r, []);
    sets.get(r)!.push(regions[i]);
  }

  const objects: GroupedObject[] = [];
  let seq = 0;
  for (const parts of sets.values()) {
    objects.push(buildObject(parts, ++seq));
  }
  // stable order: larger objects first (they usually sit lower in z)
  objects.sort((a, b) => (b.bbox.w * b.bbox.h) - (a.bbox.w * a.bbox.h));
  return objects;
}

function shouldMerge(a: Region, b: Region, cfg: GrouperOptions, diag: number): boolean {
  // Rule 2: only ever merge the same semantic class.
  if (a.type !== b.type) return false;
  // Rule 1: instanceId is authoritative.
  if (a.instanceId && b.instanceId) return a.instanceId === b.instanceId;
  if (a.instanceId === b.instanceId) { /* both null */ } // fall through to geometry
  // Geometry fallback (only when at least one instanceId is missing).
  if (iou(a.bbox, b.bbox) >= cfg.minIoU) return true;
  if (containedFraction(a.bbox, b.bbox) >= cfg.minContain) return true;
  if (containedFraction(b.bbox, a.bbox) >= cfg.minContain) return true;
  if (clearance(a.bbox, b.bbox) <= cfg.adjacencyFrac * diag) return true;
  return false;
}

function buildObject(parts: Region[], seq: number): GroupedObject {
  const type: LayerType = pickType(parts);
  const box = unionBbox(parts.map(p => p.bbox));
  // Provisional contour mask = UNION of the part contours (identity already
  // fixed here, so unioning is safe). A real alpha mask replaces this later.
  const partMasks: Mask[] = parts.map(p => ({
    kind: "polygons", bbox: p.bbox, feather: 1.5,
    polygons: p.polygons && p.polygons.length ? p.polygons : [rectPolygon(p.bbox)],
  }));
  const mask = unionMasks(partMasks);
  // size-weighted confidence
  let cw = 0, wsum = 0;
  for (const p of parts) { const w = Math.max(1, p.bbox.w * p.bbox.h); cw += p.confidence * w; wsum += w; }
  const confidence = wsum ? cw / wsum : 0;
  const instanceId = parts.find(p => p.instanceId)?.instanceId ?? null;
  return {
    id: `obj_${seq}`,
    type,
    label: typeName(type),
    instanceId,
    bbox: box,
    parts,
    mask,
    confidence,
  };
}

function pickType(parts: Region[]): LayerType {
  // largest part wins (all share type after grouping, but be robust)
  return parts.slice().sort((a, b) => (b.bbox.w * b.bbox.h) - (a.bbox.w * a.bbox.h))[0].type;
}

export function typeName(t: LayerType): string {
  return { background: "Background", product: "Product", person: "Person", object: "Object", decoration: "Decoration", independent_text: "Text" }[t];
}
