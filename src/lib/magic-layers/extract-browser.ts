/* ============================================================
   Magic Layers — browser layer extraction (canvas)
   Cuts a layer out of the ORIGINAL image along its mask contour, with a
   feathered alpha edge (no white halo, no rectangle). Text layers return null
   (they are drawn as live text). Reads only from the source image.
   Browser-only: import from client components.
   ============================================================ */
import type { LayerData, Point } from "./types.ts";

export interface Extracted { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number; }

export function extractLayer(img: CanvasImageSource, layer: LayerData, imgW: number, imgH: number): Extracted | null {
  // Independent text: crop the ORIGINAL pixels of its box (keeps the real
  // stylised lettering — never re-typed in a different font). Draggable as-is.
  if (layer.type === "independent_text") {
    const tb = clamp(layer.bbox, imgW, imgH);
    if (tb.w < 1 || tb.h < 1) return null;
    const tc = document.createElement("canvas");
    tc.width = tb.w; tc.height = tb.h;
    tc.getContext("2d", { willReadFrequently: true })!.drawImage(img, tb.x, tb.y, tb.w, tb.h, 0, 0, tb.w, tb.h);
    return { canvas: tc, x: tb.x, y: tb.y, w: tb.w, h: tb.h };
  }

  if (layer.type === "background") {
    const c = document.createElement("canvas");
    c.width = imgW; c.height = imgH;
    c.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0, imgW, imgH);
    return { canvas: c, x: 0, y: 0, w: imgW, h: imgH };
  }

  const b = clamp(layer.bbox, imgW, imgH);
  if (b.w < 1 || b.h < 1) return null;

  // 1) copy original pixels for the region
  const c = document.createElement("canvas");
  c.width = b.w; c.height = b.h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);

  // 2) alpha mask from the union polygons (feathered)
  const polys = layer.mask?.polygons ?? [];
  if (polys.length) {
    const m = document.createElement("canvas");
    m.width = b.w; m.height = b.h;
    const mctx = m.getContext("2d")!;
    const feather = layer.mask?.feather ?? 1.5;
    if (feather > 0) mctx.filter = `blur(${feather}px)`;
    mctx.fillStyle = "#fff";
    for (const poly of polys) fillPoly(mctx, poly, b.x, b.y);
    mctx.filter = "none";
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(m, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
  return { canvas: c, x: b.x, y: b.y, w: b.w, h: b.h };
}

function fillPoly(ctx: CanvasRenderingContext2D, poly: Point[], ox: number, oy: number) {
  if (poly.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(poly[0].x - ox, poly[0].y - oy);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x - ox, poly[i].y - oy);
  ctx.closePath();
  ctx.fill();
}
function clamp(b: { x: number; y: number; w: number; h: number }, W: number, H: number) {
  const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
  return { x, y, w: Math.min(Math.ceil(b.w), W - x), h: Math.min(Math.ceil(b.h), H - y) };
}
