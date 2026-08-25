/* ============================================================
   Magic Layers — geometry helpers (pure)
   ============================================================ */
import type { Bbox, Point } from "./types.ts";

export function bbox(x: number, y: number, w: number, h: number): Bbox { return { x, y, w, h }; }
export function area(b: Bbox): number { return Math.max(0, b.w) * Math.max(0, b.h); }
export function center(b: Bbox): Point { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }

export function intersection(a: Bbox, b: Bbox): Bbox | null {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const w = x2 - x1, h = y2 - y1;
  return w > 0 && h > 0 ? { x: x1, y: y1, w, h } : null;
}

/** fraction of `inner` covered by `outer` (0..1) */
export function containedFraction(inner: Bbox, outer: Bbox): number {
  const i = intersection(inner, outer);
  const ia = area(inner);
  return !i || ia === 0 ? 0 : area(i) / ia;
}

/** IoU of two boxes (0..1) */
export function iou(a: Bbox, b: Bbox): number {
  const i = intersection(a, b);
  if (!i) return 0;
  const u = area(a) + area(b) - area(i);
  return u === 0 ? 0 : area(i) / u;
}

export function pointInBbox(p: Point, b: Bbox): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/** smallest gap between two boxes; 0 if they touch/overlap */
export function clearance(a: Bbox, b: Bbox): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.hypot(dx, dy);
}

/** union bbox of many boxes */
export function unionBbox(boxes: Bbox[]): Bbox {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const b of boxes) {
    minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
    maxx = Math.max(maxx, b.x + b.w); maxy = Math.max(maxy, b.y + b.h);
  }
  return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
}

export function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

export function rectPolygon(b: Bbox): Point[] {
  return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
}
