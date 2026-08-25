/* ============================================================
   Magic Layers — MaskUnioner
   Unions masks of the SAME object. Only call AFTER identity is fixed.

   Since v2 segments each WHOLE object in a single request, real cut-outs are
   already ONE merged alpha PNG per object — no server-side sharp compositing is
   needed here, which keeps this module PURE and safe inside the client bundle.
   `unionMasks` only handles the mock/polygon provisional contour.
   ============================================================ */
import type { Mask, Point } from "./types.ts";
import { unionBbox, rectPolygon } from "./geometry.ts";

/** Union polygon (mock) masks into one contour mask. */
export function unionMasks(masks: Mask[]): Mask {
  if (masks.length === 0) return { kind: "rect", bbox: { x: 0, y: 0, w: 0, h: 0 }, polygons: [] };
  if (masks.length === 1) return masks[0];
  const bbox = unionBbox(masks.map(m => m.bbox));
  const polygons: Point[][] = [];
  for (const m of masks) polygons.push(...(m.polygons?.length ? m.polygons : [rectPolygon(m.bbox)]));
  return { kind: "polygons", polygons, bbox, feather: 1.5 };
}
