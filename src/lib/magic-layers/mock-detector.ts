/* ============================================================
   Magic Layers — MockDetector (demo / dev, no API)

   Stands in for the OpenRouter VLM. It deliberately emits FRAGMENTED parts
   (head, hair, shirt, arm, leg…) sharing one instanceId, plus a product and a
   decoration, so the SemanticObjectGrouper is actually exercised: the editor
   must show ONE Person, not six body-part layers. Text objects include an
   embedded packaging label, an independent headline/price, and one ambiguous.

   Deterministic (scales with image size). Swap for OpenRouterDetector later.
   ============================================================ */
import type { Detector, DetectResult, Region, RawText, LayerType } from "./types.ts";
import { bbox } from "./geometry.ts";

let seq = 0;
function part(type: LayerType, label: string, instanceId: string, x: number, y: number, w: number, h: number, conf = 0.9): Region {
  return { id: `r${++seq}`, type, label, instanceId, bbox: bbox(Math.round(x), Math.round(y), Math.round(w), Math.round(h)), confidence: conf };
}
function txt(text: string, x: number, y: number, w: number, h: number, conf: number): RawText {
  return { id: `t${++seq}`, text, bbox: bbox(Math.round(x), Math.round(y), Math.round(w), Math.round(h)), confidence: conf };
}

export function MockDetector(): Detector {
  return {
    async detect(image): Promise<DetectResult> {
      const W = image.width, H = image.height;
      const portrait = H >= W;

      const regions: Region[] = [];
      // A person, FRAGMENTED into parts that all share instance "person_1".
      const px = W * 0.10, py = H * 0.14, pw = W * 0.42, ph = H * 0.66;
      regions.push(part("person", "head", "person_1", px + pw * 0.30, py, pw * 0.40, ph * 0.18, 0.9));
      regions.push(part("person", "hair", "person_1", px + pw * 0.26, py - ph * 0.03, pw * 0.48, ph * 0.12, 0.86));
      regions.push(part("person", "torso", "person_1", px + pw * 0.12, py + ph * 0.18, pw * 0.76, ph * 0.40, 0.9));
      regions.push(part("person", "arm", "person_1", px, py + ph * 0.20, pw * 0.22, ph * 0.42, 0.84));
      regions.push(part("person", "legs", "person_1", px + pw * 0.20, py + ph * 0.58, pw * 0.60, ph * 0.42, 0.88));

      // A product (single region), instance "product_1".
      const qx = W * 0.58, qy = H * 0.52, qw = W * 0.30, qh = H * 0.40;
      regions.push(part("product", "bottle", "product_1", qx, qy, qw, qh, 0.92));

      // A decoration (lower confidence -> exercises the "need confirm" band).
      regions.push(part("decoration", "leaves", "decoration_1", W * 0.72, H * 0.06, W * 0.22, H * 0.2, 0.56));

      const textObjects: RawText[] = [
        txt("PURE SKIN", qx + qw * 0.15, qy + qh * 0.30, qw * 0.7, qh * 0.14, 0.9),   // embedded on product
        txt("夏日保養新品", W * 0.05, H * 0.02, W * 0.42, H * 0.05, 0.94),               // independent headline
        txt("$1,280", W * 0.06, H * 0.90, W * 0.18, H * 0.06, 0.9),                    // independent price (bottom-left, clear of objects)
        txt("SUMMER", qx + qw * 0.78, qy - qh * 0.02, qw * 0.5, qh * 0.12, 0.6),       // ambiguous -> unknown
      ];

      seq = 0;
      return { width: W, height: H, regions, textObjects };
    },
  };
}
