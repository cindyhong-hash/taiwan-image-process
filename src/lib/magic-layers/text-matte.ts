/* ============================================================
   Magic Layers — text matting (server, sharp; NO API cost)
   Makes an independent-text box into a TRANSPARENT cut-out of just the letters,
   preserving the original stylised pixels (gold title, etc.) so it drags cleanly
   over other layers.

   Method: background-subtraction colour key. Text over a poster has a
   background that surrounds it, so we estimate the background colour from the
   box's border ring, then set alpha by each pixel's colour distance from that
   background. Letters (distinct colour) become opaque; background drops out.

   Heuristic — guarded: if the resulting matte looks wrong (almost empty or
   almost full), returns null so the caller keeps the plain rectangular crop.
   ============================================================ */
import sharp from "sharp";
import type { Bbox } from "./types.ts";

function clampBox(b: Bbox, W: number, H: number, padFrac = 0.06) {
  const px = Math.round(b.w * padFrac), py = Math.round(b.h * padFrac);
  const x = Math.max(0, Math.floor(b.x - px)), y = Math.max(0, Math.floor(b.y - py));
  const right = Math.min(W, Math.ceil(b.x + b.w + px)), bottom = Math.min(H, Math.ceil(b.y + b.h + py));
  return { left: x, top: y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

export async function matteText(imageBuf: Buffer, bbox: Bbox, W: number, H: number): Promise<{ buffer: Buffer; box: Bbox } | null> {
  try {
    const ex = clampBox(bbox, W, H);
    if (ex.width < 4 || ex.height < 4) return null;

    // Foreground pixels + a heavily-blurred copy = the LOCAL background estimate.
    // Text strokes are sharp/high-contrast, so they differ strongly from their
    // blurred neighbourhood; a smooth gradient background blurs to ~itself and
    // drops out. This survives fireworks/gradients far better than one global
    // background colour.
    const fg = sharp(imageBuf).extract(ex).removeAlpha();
    const blurR = Math.max(4, Math.round(Math.min(ex.width, ex.height) * 0.12));
    const [{ data, info }, bg] = await Promise.all([
      fg.clone().raw().toBuffer({ resolveWithObject: true }),
      fg.clone().blur(blurR).raw().toBuffer(),
    ]);
    const { width, height } = info; const ch = info.channels; // 3

    const out = Buffer.alloc(width * height * 4);
    const soft = 22, full = 95;   // local colour-distance ramp -> alpha
    let opaque = 0;
    for (let p = 0; p < width * height; p++) {
      const i = p * ch, o = p * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const dist = Math.sqrt((r - bg[i]) ** 2 + (g - bg[i + 1]) ** 2 + (b - bg[i + 2]) ** 2);
      const a = Math.max(0, Math.min(255, Math.round((dist - soft) / (full - soft) * 255)));
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
      if (a > 30) opaque++;
    }
    const ratio = opaque / (width * height);
    // Guard: reject only clearly-broken mattes. Bold titles legitimately fill a
    // lot of their box (~65-80%), so allow up to 0.88; only near-empty (<1%) or
    // near-solid (>0.88 = couldn't separate anything) fall back.
    if (ratio < 0.01 || ratio > 0.88) return null;

    // slight feather so strokes aren't jagged
    const buffer = await sharp(out, { raw: { width, height, channels: 4 } }).blur(0.5).png().toBuffer();
    return { buffer, box: { x: ex.left, y: ex.top, w: ex.width, h: ex.height } };
  } catch {
    return null;
  }
}
