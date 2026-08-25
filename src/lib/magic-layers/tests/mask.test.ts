/* ============================================================
   Tests — MaskProvider seam, fallback chain, MaskUnioner, and the full
   analyze() pipeline with mock providers (no FAL calls).
   ============================================================ */
import { describe, it, expect } from "./runner.ts";
import type { Detector, Region, RawText, LayerType, Bbox } from "../types.ts";
import { MockSamMaskProvider, MockBiRefNetMaskProvider, FallbackMaskProvider } from "../mask-providers/mock.ts";
import { unionMasks } from "../mask-unioner.ts";
import { analyze } from "../analysis.ts";

const IMG = { url: "mock://img", width: 1000, height: 1000 };
let seq = 0;
function region(type: LayerType, label: string, instanceId: string | null, b: Bbox): Region {
  return { id: `r${++seq}`, type, label, instanceId, bbox: b, confidence: 0.9 };
}
function mockDetector(regions: Region[], textObjects: RawText[] = []): Detector {
  return { async detect() { return { width: IMG.width, height: IMG.height, regions, textObjects }; } };
}
const personParts = (id: string, ox = 0): Region[] => [
  region("person", "head", id, { x: 400 + ox, y: 120, w: 120, h: 120 }),
  region("person", "hair", id, { x: 390 + ox, y: 100, w: 140, h: 80 }),
  region("person", "shirt", id, { x: 360 + ox, y: 240, w: 220, h: 220 }),
  region("person", "arm", id, { x: 330 + ox, y: 250, w: 90, h: 200 }),
  region("person", "leg", id, { x: 380 + ox, y: 460, w: 160, h: 260 }),
];

describe("MaskProvider seam", () => {
  it("MockSam returns a MaskResult with source, bbox, dims and a non-rect contour", async () => {
    const sam = MockSamMaskProvider();
    const r = await sam.segment(IMG, { bbox: { x: 100, y: 100, w: 200, h: 300 } });
    expect(r.source).toBe("mock");
    expect(r.width).toBe(1000);
    expect(r.mask.kind).toBe("polygons");
    expect(r.mask.polygons![0].length).toBe(8);   // octagon, not a rectangle
  });

  it("FallbackMaskProvider falls back to BiRefNet when SAM2 fails", async () => {
    const sam = MockSamMaskProvider({ failOn: () => true });      // always fail
    const bire = MockBiRefNetMaskProvider();
    const chain = FallbackMaskProvider(sam, bire);
    const r = await chain.segment(IMG, { bbox: { x: 0, y: 0, w: 10, h: 10 } });
    expect(r).toBeTruthy();                                       // did not throw
    expect(r.mask.polygons!.length > 0).toBe(true);
  });

  it("FallbackMaskProvider falls back when SAM2 confidence is below threshold", async () => {
    const sam = MockSamMaskProvider({ confidence: 0.2 });
    const bire = MockBiRefNetMaskProvider({ confidence: 0.95 });
    const chain = FallbackMaskProvider(sam, bire, 0.5);
    const r = await chain.segment(IMG, { bbox: { x: 0, y: 0, w: 10, h: 10 } });
    expect(r.confidence).toBe(0.95);                             // used fallback
  });

  it("MaskUnioner unions many part contours into one mask", () => {
    const masks = personParts("p1").map(p => ({ kind: "polygons" as const, bbox: p.bbox, polygons: [[{ x: p.bbox.x, y: p.bbox.y }]] }));
    const u = unionMasks(masks);
    expect(u.kind).toBe("polygons");
    expect(u.polygons!.length).toBe(5);
  });
});

describe("analyze() end-to-end (mock providers)", () => {
  it("one fragmented person -> Background + Person, mask from provider, not fragmented", async () => {
    const chain = FallbackMaskProvider(MockSamMaskProvider(), MockBiRefNetMaskProvider());
    const res = await analyze(IMG, { detector: mockDetector(personParts("person_1")), maskProvider: chain });
    expect(res.layers.map(l => l.type)).toEqual(["background", "person"]);
    const person = res.layers[1];
    expect(person.mask!.kind).toBe("polygons");     // union contour, not a rect crop
    expect(res.objects[0].maskSource).toBe("mock");
    expect(res.fragmentation.blocked).toBe(false);
  });

  it("does NOT falsely block a legit multi-object scene (8 distinct objects)", async () => {
    // A whole-object detector returning 8 real objects is fine — one layer each.
    const regions = Array.from({ length: 8 }, (_, i) =>
      region("object", `thing${i}`, `object_${i}`, { x: i * 110, y: 10, w: 90, h: 90 }));
    const res = await analyze(IMG, { detector: mockDetector(regions) });
    expect(res.objects.length).toBe(8);
    expect(res.fragmentation.blocked).toBe(false);
  });
});
