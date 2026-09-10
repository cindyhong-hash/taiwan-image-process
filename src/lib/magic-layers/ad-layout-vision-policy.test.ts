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
    background: { ...safe, safeForDeclaredRole: false, productVisible: true, confidence: 0.99, reason: "完整瓶身" },
  }));

  assert.equal(result.context.inventory.byRole.background, undefined);
  assert.match(result.omitted[0]?.reason ?? "", /商品/);
  assert.match(result.advice.warnings[0] ?? "", /背景/);
});

test("omits a trusted asset that is visibly unsuitable for its declared role", () => {
  const result = applyAdLayoutVisionPolicy(context, vision({
    decoration: { ...safe, safeForDeclaredRole: false, textOrLogoVisible: true, confidence: 0.99, reason: "含有完整標題卡" },
  }));

  assert.equal(result.context.inventory.byRole.decoration, undefined);
  assert.match(result.omitted[0]?.reason ?? "", /裝飾元素/);
});

test("keeps an empty environmental background when the model calls it a complete scene", () => {
  const result = applyAdLayoutVisionPolicy(context, vision({
    background: { ...safe, safeForDeclaredRole: false, completeSceneVisible: true, confidence: 0.99, reason: "完整居家空景" },
  }));

  assert.equal(result.context.inventory.byRole.background?.imageUrl, "background");
  assert.deepEqual(result.omitted, []);
});

test("keeps a single-call conflict below the destructive confidence threshold", () => {
  const result = applyAdLayoutVisionPolicy(context, vision({
    detail: { ...safe, safeForDeclaredRole: false, productVisible: true, confidence: 0.9, reason: "可能含有商品" },
  }));

  assert.equal(result.context.inventory.byRole.detail?.imageUrl, "detail");
  assert.deepEqual(result.omitted, []);
  assert.match(result.advice.warnings[0] ?? "", /信心不足.*保留/);
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
    { textSafeArea: "right-top", placementSurface: "counter", surfaceRect: { x: 0.08, y: 0.62, w: 0.55, h: 0.1 }, confidence: 0.9 },
  ));

  assert.equal(result.advice.preferredTextSafeArea, "right-top");
  assert.equal(result.advice.sceneGrounding, "surface");
  assert.deepEqual(result.advice.surfaceRect, { x: 0.08, y: 0.62, w: 0.55, h: 0.1 });
});

// sceneGrounding 回答「這是不是可信的檯面場景」（陰影、商品整合模式吃它），
// surfaceRect 回答「要貼齊到哪個座標」（composition、polish 吃它）。
// 兩者要分開：檯面可信但模型沒給合法座標時，仍該當作檯面場景，
// 只是不做位置貼齊 —— 綁在一起會讓座標差一點就連陰影都掉了。
test("keeps surface grounding without a rect, but exposes no rect to align to", () => {
  const missingRect = applyAdLayoutVisionPolicy(context, vision(
    { background: safe },
    { textSafeArea: "right-top", placementSurface: "counter", confidence: 0.9 },
  ));
  const lowConfidence = applyAdLayoutVisionPolicy(context, vision(
    { background: safe },
    { textSafeArea: "right-top", placementSurface: "counter", surfaceRect: { x: 0.08, y: 0.62, w: 0.55, h: 0.1 }, confidence: 0.6 },
  ));

  assert.equal(missingRect.advice.sceneGrounding, "surface");
  assert.equal(missingRect.advice.surfaceRect, undefined);
  assert.equal(lowConfidence.advice.sceneGrounding, "floating");
  assert.equal(lowConfidence.advice.surfaceRect, undefined);
});

test("does not use composition advice from a removed background or fallback", () => {
  const removed = applyAdLayoutVisionPolicy(context, vision(
    { background: { ...safe, productVisible: true, safeForDeclaredRole: false } },
    { textSafeArea: "right-top", placementSurface: "counter", confidence: 0.9 },
  ));
  const fallback = applyAdLayoutVisionPolicy(context, { version: 1, source: "fallback", assets: {}, warnings: ["fallback"] });

  assert.equal(removed.advice.preferredTextSafeArea, undefined);
  assert.equal(removed.advice.sceneGrounding, "floating");
  assert.equal(removed.advice.surfaceRect, undefined);
  assert.equal(fallback.context.inventory.byRole.background?.imageUrl, "background");
  assert.equal(fallback.advice.source, "fallback");
});
