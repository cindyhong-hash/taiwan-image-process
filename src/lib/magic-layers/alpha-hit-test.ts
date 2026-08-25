/* ============================================================
   Magic Layers — pixel-perfect alpha hit testing (browser).
   Photoshop-like selection: a click only hits a layer where its cut-out is
   actually opaque, so transparent areas fall through to the layer below.
   ============================================================ */
export function alphaHit(canvas: HTMLCanvasElement, u: number, v: number, threshold = 10): boolean {
  const x = Math.floor(u), y = Math.floor(v);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
  try {
    const d = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(x, y, 1, 1).data;
    return d[3] > threshold;
  } catch {
    return true; // tainted/unreadable canvas -> fail open to bbox behaviour
  }
}
