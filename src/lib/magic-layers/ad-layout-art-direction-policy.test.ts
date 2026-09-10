import assert from "node:assert/strict";
import test from "node:test";
import { applyArtDirectionPolicy } from "./ad-layout-art-direction-policy.ts";
import type { DirectionDecision } from "./ad-layout-art-direction.ts";

const productFocus: DirectionDecision = {
  direction: "product-focus", composition: "copy-left", typography: "bold", density: "minimal",
  support: "benefit", decoration: "one", accent: "secondary", graphics: "benefit-group", backdrop: "light-fade", confidence: 0.9,
};

test("keeps only trusted decisions and never restores a missing unsafe asset", () => {
  const policy = applyArtDirectionPolicy({
    decision: { version: 1, directions: [productFocus, { ...productFocus, direction: "editorial", confidence: 0.6 }, { ...productFocus, direction: "scene-led", support: "detail" }] },
    hasSecondaryAccent: false,
    assets: { hero: true, detail: false, benefit: false, decoration: true },
    benefits: [{ id: "a", text: "保濕" }],
  });

  assert.equal(policy["product-focus"]?.support, "none");
  assert.equal(policy["product-focus"]?.accent, "primary");
  assert.equal(policy["product-focus"]?.graphics, "benefit-group");
  assert.equal(policy.editorial, undefined);
  assert.equal(policy["scene-led"]?.support, "none");
});

test("does not plan benefit graphics when no user-confirmed benefit exists", () => {
  const policy = applyArtDirectionPolicy({
    decision: { version: 1, directions: [productFocus, { ...productFocus, direction: "editorial" }, { ...productFocus, direction: "scene-led" }] },
    hasSecondaryAccent: true,
    assets: { hero: true, detail: true, benefit: true, decoration: true },
    benefits: [],
  });
  assert.equal(policy["product-focus"]?.graphics, "none");
});
