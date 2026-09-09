import assert from "node:assert/strict";
import test from "node:test";
import { createAdLayoutContext } from "./ad-layout-context.ts";
import { applyAdLayoutVisionPolicy } from "./ad-layout-vision-policy.ts";
import type { AdLayoutVisionAssessment, AssetSafety } from "./ad-layout-vision.ts";

const context = createAdLayoutContext({
  product: { id: "product-1", name: "潔顏乳", heroImageUrl: "hero" },
  client: { logoUrls: '["logo"]' },
  assets: [
    { assetRole: "background", imageUrl: "background" },
    { assetRole: "detail", imageUrl: "detail" },
    { assetRole: "benefit", imageUrl: "benefit" },
    { assetRole: "decoration", imageUrl: "decoration" },
  ],
});

const safe: AssetSafety = {
  safeForDeclaredRole: true,
  productVisible: false,
  textOrLogoVisible: false,
  completeSceneVisible: false,
  confidence: 0.9,
};

function vision(assets: AdLayoutVisionAssessment["assets"], background?: AdLayoutVisionAssessment["background"]): AdLayoutVisionAssessment {
  return { version: 1, source: "vision", assets, background, warnings: [] };
}

test("omits a trusted legacy background containing a product before planning", () => {
  const result = applyAdLayoutVisionPolicy(context, vision({
    background: { ...safe, safeForDeclaredRole: false, productVisible: true, reason: "完整瓶身" },
  }));

  assert.equal(result.context.inventory.byRole.background, undefined);
  assert.match(result.omitted[0]?.reason ?? "", /商品/);
  assert.match(result.advice.warnings[0] ?? "", /背景/);
});

test("keeps uncertain material and always keeps identity-critical hero and logo", () => {
  const result = applyAdLayoutVisionPolicy(context, vision({
    detail: { ...safe, safeForDeclaredRole: false, productVisible: true, confidence: 0.4 },
  }));

  assert.equal(result.context.inventory.byRole.detail?.imageUrl, "detail");
  assert.equal(result.context.inventory.byRole.hero?.imageUrl, "hero");
  assert.equal(result.context.inventory.logo?.imageUrl, "logo");
  assert.deepEqual(result.omitted, []);
});

test("applies only trusted valid background advice from a retained background", () => {
  const result = applyAdLayoutVisionPolicy(context, vision(
    { background: safe },
    { textSafeArea: "right-top", placementSurface: "counter", confidence: 0.9 },
  ));

  assert.equal(result.advice.preferredTextSafeArea, "right-top");
  assert.equal(result.advice.sceneGrounding, "surface");
});

test("does not use composition advice from a removed background or fallback", () => {
  const removed = applyAdLayoutVisionPolicy(context, vision(
    { background: { ...safe, productVisible: true, safeForDeclaredRole: false } },
    { textSafeArea: "right-top", placementSurface: "counter", confidence: 0.9 },
  ));
  const fallback = applyAdLayoutVisionPolicy(context, { version: 1, source: "fallback", assets: {}, warnings: ["fallback"] });

  assert.equal(removed.advice.preferredTextSafeArea, undefined);
  assert.equal(removed.advice.sceneGrounding, "floating");
  assert.equal(fallback.context.inventory.byRole.background?.imageUrl, "background");
  assert.equal(fallback.advice.source, "fallback");
});
