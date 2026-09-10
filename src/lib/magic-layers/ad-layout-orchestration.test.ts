import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectedCandidates } from "./ad-layout-orchestration.ts";
import type { AdLayoutInput } from "./ad-layout-recipes.ts";
import type { ArtDirectionResult } from "./ad-layout-art-direction.ts";

const input: AdLayoutInput = {
  canvasWidth: 1024, canvasHeight: 1280, ratio: "4:5", backgroundUrl: "background", heroUrl: "hero", decorationUrl: "decoration",
  title: "溫和保養", subtitle: "每天更美好", brandColor: "#336699", purpose: "product",
};

test("provider fallback returns the same deterministic candidates", () => {
  const fallback: ArtDirectionResult = { source: "fallback", decision: null, reason: "timeout" };
  assert.deepEqual(buildDirectedCandidates(input, fallback, { hero: true, detail: false, benefit: false, decoration: true }, false, []), buildDirectedCandidates(input, { source: "fallback", decision: null, reason: "disabled" }, { hero: true, detail: false, benefit: false, decoration: true }, false, []));
});

test("a valid vision decision changes only bounded design fields", () => {
  const result: ArtDirectionResult = { source: "vision", decision: { version: 1, directions: [
    { direction: "product-focus", composition: "stacked", typography: "quiet", density: "balanced", support: "none", decoration: "none", accent: "primary", graphics: "none", backdrop: "dark-fade", confidence: 0.9 },
    { direction: "editorial", composition: "copy-right", typography: "bold", density: "minimal", support: "none", decoration: "one", accent: "primary", graphics: "none", backdrop: "none", confidence: 0.9 },
    { direction: "scene-led", composition: "copy-left", typography: "balanced", density: "minimal", support: "none", decoration: "one", accent: "primary", graphics: "none", backdrop: "none", confidence: 0.9 },
  ] } };
  const candidates = buildDirectedCandidates(input, result, { hero: true, detail: false, benefit: false, decoration: true }, false, []);
  assert.equal(candidates[0].designDecision?.source, "vision");
  assert.equal(candidates[0].layers.some((layer) => layer.id === "decoration_1"), false);
  assert.equal(candidates[0].layers.some((layer) => layer.id === "art_direction_backdrop"), true);
  assert.equal(candidates.every((candidate) => candidate.layers.some((layer) => layer.id === "product_1")), true);
});
