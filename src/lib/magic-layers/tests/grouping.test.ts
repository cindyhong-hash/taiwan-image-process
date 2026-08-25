/* ============================================================
   Tests — SemanticObjectGrouper + layer generation (anti-fragmentation)
   Covers the 5 mandated cases + fragmentation + mask-union + complexity.
   ============================================================ */
import { describe, it, expect } from "./runner.ts";
import type { Region, RawText, LayerType } from "../types.ts";
import { rectPolygon } from "../geometry.ts";
import { groupObjects } from "../semantic-grouper.ts";
import { classifyAllText } from "../text-ownership.ts";
import { generateLayers } from "../generate-layers.ts";
import { validateFragmentation } from "../layer-fragmentation.ts";

const IMG = { width: 1000, height: 1000 };
let seq = 0;
function region(type: LayerType, label: string, instanceId: string | null, x: number, y: number, w: number, h: number, conf = 0.9): Region {
  const b = { x, y, w, h };
  return { id: `r${++seq}`, type, label, instanceId, bbox: b, confidence: conf, polygons: [rectPolygon(b)] };
}
function text(str: string, x: number, y: number, w: number, h: number, conf = 0.9): RawText {
  return { id: `t${++seq}`, text: str, bbox: { x, y, w, h }, confidence: conf };
}
/** full pipeline (no mask provider -> keeps union-polygon masks) */
function pipeline(regions: Region[], texts: RawText[] = []) {
  const objects = groupObjects(regions, IMG);
  const classified = classifyAllText(texts, objects, IMG);
  const layers = generateLayers(objects, classified, IMG);
  return { objects, classified, layers, types: layers.map(l => l.type) };
}

// A person fragmented into 6 parts, all one instance.
function personParts(instance: string, ox = 0): Region[] {
  return [
    region("person", "head", instance, 400 + ox, 120, 120, 120),
    region("person", "hair", instance, 390 + ox, 100, 140, 80),
    region("person", "shirt", instance, 360 + ox, 240, 220, 220),
    region("person", "arm", instance, 330 + ox, 250, 90, 200),
    region("person", "leg", instance, 380 + ox, 460, 160, 260),
    region("person", "shoe", instance, 380 + ox, 720, 160, 60),
  ];
}

describe("SemanticObjectGrouper — anti-fragmentation", () => {

  it("Test 1: a whole person collapses to ONE Person layer (not head/hair/arm…)", () => {
    const { objects, types } = pipeline(personParts("p1"));
    expect(objects).toHaveLength(1);
    expect(objects[0].type).toBe("person");
    expect(objects[0].parts).toHaveLength(6);   // fragments preserved as children
    expect(types).toEqual(["background", "person"]);
  });

  it("Test 2: person + product + headline -> Background, Person, Product, Text", () => {
    const regions = [...personParts("p1"), region("product", "bottle", "pr1", 640, 520, 240, 300, 0.92)];
    const { types } = pipeline(regions, [text("夏日新品", 40, 30, 380, 70, 0.94)]);
    expect(types.filter(t => t === "person")).toHaveLength(1);
    expect(types.filter(t => t === "product")).toHaveLength(1);
    expect(types).toEqual(["background", "person", "product", "independent_text"]);
  });

  it("Test 3: product-packaging text is EMBEDDED, not its own layer", () => {
    const regions = [region("product", "bottle", "pr1", 300, 300, 400, 460, 0.92)];
    const onPack = text("PURE SKIN", 360, 400, 260, 70, 0.9);
    const { classified, layers, types } = pipeline(regions, [onPack]);
    expect(types).toEqual(["background", "product"]);          // no text layer
    expect(classified[0].ownership).toBe("embedded");
    const product = layers.find(l => l.type === "product")!;
    expect(product.embeddedText.map(t => t.text)).toEqual(["PURE SKIN"]);
  });

  it("Test 4: two people stay TWO Person layers (instanceId separates them)", () => {
    const regions = [...personParts("p1"), ...personParts("p2", 480)];  // p2 shifted right, no id sharing
    const { objects, types } = pipeline(regions);
    expect(objects.filter(o => o.type === "person")).toHaveLength(2);
    expect(types.filter(t => t === "person")).toHaveLength(2);
  });

  it("Test 5: person + product held in hand -> separate layers (different class never merges)", () => {
    // product bbox overlaps the person's arm region, but type differs -> must not merge
    const regions = [...personParts("p1"), region("product", "cup", "pr1", 320, 300, 120, 140, 0.9)];
    const { objects } = pipeline(regions);
    expect(objects.filter(o => o.type === "person")).toHaveLength(1);
    expect(objects.filter(o => o.type === "product")).toHaveLength(1);
  });

  it("mask union: a grouped person carries a UNION of its part contours (not one rect)", () => {
    const { objects } = pipeline(personParts("p1"));
    const m = objects[0].mask;
    expect(m.kind).toBe("polygons");
    expect(m.polygons!).toHaveLength(6);   // 6 parts unioned into one mask
  });

  it("geometry fallback: same-type adjacent fragments merge even without instanceId", () => {
    const regions = [
      region("object", "seat", null, 400, 400, 200, 60),
      region("object", "back", null, 400, 300, 200, 110),   // adjacent/overlapping, same type, no id
      region("object", "legs", null, 410, 460, 180, 180),
    ];
    const { objects } = pipeline(regions);
    expect(objects).toHaveLength(1);
    expect(objects[0].type).toBe("object");
  });
});

describe("LayerFragmentationValidator", () => {
  const fake = (type: LayerType, i: number) => ({ id: `l${i}`, type, name: "x", image: "x.png", instanceId: null }) as unknown as import("../types").LayerData;

  it("flags & BLOCKS fragmentation: 5 objects but 28 object-layers (invariant broken)", () => {
    const layers = Array.from({ length: 28 }, (_, i) => fake("object", i));
    const r = validateFragmentation(40, 5, layers);
    expect(r.blocked).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("flags runaway total layer count (> ceiling)", () => {
    const layers = Array.from({ length: 30 }, (_, i) => fake("object", i));
    const r = validateFragmentation(30, 30, layers);   // objectLayers == objectCount, but too many
    expect(r.blocked).toBe(true);
  });

  it("passes healthy case: 32 regions -> 5 objects -> 7 layers", () => {
    const layers = [
      fake("background", 0), fake("person", 1), fake("person", 2), fake("product", 3),
      fake("decoration", 4), fake("independent_text", 5), fake("independent_text", 6),
    ];
    const r = validateFragmentation(32, 5, layers);
    expect(r.blocked).toBe(false);
    expect(r.ok).toBe(true);
  });
});
