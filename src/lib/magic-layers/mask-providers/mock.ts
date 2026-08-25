/* ============================================================
   Magic Layers — MOCK mask providers (phase 1, no FAL calls)

   These fulfil the MaskProvider seam without any network/API so the whole
   pipeline + tests run for free. Swap-in order later:
       MockSamMaskProvider      -> SamMaskProvider      (fal SAM2)
       MockBiRefNetMaskProvider -> BiRefNetMaskProvider (fal BiRefNet)

   The mock returns a polygon contour derived from the prompt bbox (a rounded
   octagon, so it is visibly NOT a plain rectangle and the extractor path is
   exercised). Real providers return an alpha cutout instead.
   ============================================================ */
import type { MaskProvider, MaskResult, SegmentPrompt, Mask, Point, MaskSource } from "../types.ts";

function octagon(b: { x: number; y: number; w: number; h: number }): Point[] {
  const ix = b.w * 0.18, iy = b.h * 0.18; // corner inset -> octagon, clearly non-rectangular
  return [
    { x: b.x + ix, y: b.y }, { x: b.x + b.w - ix, y: b.y },
    { x: b.x + b.w, y: b.y + iy }, { x: b.x + b.w, y: b.y + b.h - iy },
    { x: b.x + b.w - ix, y: b.y + b.h }, { x: b.x + ix, y: b.y + b.h },
    { x: b.x, y: b.y + b.h - iy }, { x: b.x, y: b.y + iy },
  ];
}

function makeMock(source: MaskSource, name: string, opts?: { failOn?: (p: SegmentPrompt) => boolean; confidence?: number }): MaskProvider {
  return {
    name,
    async segment(image, prompt): Promise<MaskResult> {
      if (opts?.failOn?.(prompt)) throw new Error(`${name}: simulated segmentation failure`);
      const poly = octagon(prompt.bbox);
      const mask: Mask = { kind: "polygons", polygons: [poly], bbox: prompt.bbox, feather: 1.5 };
      return {
        mask, bbox: prompt.bbox, confidence: opts?.confidence ?? 0.9,
        source, width: image.width, height: image.height,
      };
    },
  };
}

/** Stand-in for fal SAM2 (box-prompted). */
export function MockSamMaskProvider(opts?: { failOn?: (p: SegmentPrompt) => boolean; confidence?: number }): MaskProvider {
  return makeMock("mock", "MockSamMaskProvider", opts);
}

/** Stand-in for fal BiRefNet (per-crop). */
export function MockBiRefNetMaskProvider(opts?: { confidence?: number }): MaskProvider {
  return makeMock("mock", "MockBiRefNetMaskProvider", opts);
}

/** Primary → fallback → throw. Depends only on the MaskProvider interface, so
 *  the mock and real chains are identical in shape. */
export function FallbackMaskProvider(
  primary: MaskProvider,
  fallback: MaskProvider,
  minConfidence = 0.5,
): MaskProvider {
  return {
    name: `Fallback(${primary.name} → ${fallback.name})`,
    async segment(image, prompt): Promise<MaskResult> {
      try {
        const r = await primary.segment(image, prompt);
        if (r && isValid(r) && r.confidence >= minConfidence) return r;
      } catch { /* fall through */ }
      // SAM2 failed / low-confidence / invalid → BiRefNet
      const fb = await fallback.segment(image, prompt);
      if (!isValid(fb)) throw new Error("both primary and fallback returned invalid masks");
      return fb;
    },
  };
}

function isValid(r: MaskResult): boolean {
  if (!r || !r.mask) return false;
  if (r.mask.kind === "alpha") return !!r.mask.alphaUrl;
  return !!(r.mask.polygons && r.mask.polygons.length && r.mask.polygons[0].length >= 3);
}
