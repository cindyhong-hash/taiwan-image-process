import assert from "node:assert/strict";
import test from "node:test";
import { createAdLayoutContext } from "./ad-layout-context.ts";
import { assessAdLayoutVisualKit, parseAdLayoutVisionAssessment } from "./ad-layout-vision.ts";

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

const validJson = JSON.stringify({
  version: 1,
  assets: {
    background: {
      safeForDeclaredRole: true,
      productVisible: false,
      textOrLogoVisible: false,
      completeSceneVisible: false,
      confidence: 1.6,
      ignored: "value",
    },
  },
  background: { textSafeArea: "left-top", placementSurface: "counter", confidence: -0.2, templateId: "ignored" },
  injectedUrl: "https://unsafe.example",
});

test("parses only the supported assessment fields and clamps confidence", () => {
  const value = parseAdLayoutVisionAssessment(`\`\`\`json\n${validJson}\n\`\`\``);

  assert.equal(value?.assets.background?.confidence, 1);
  assert.equal(value?.background?.confidence, 0);
  assert.equal(value?.background?.textSafeArea, "left-top");
  assert.equal("templateId" in (value?.background ?? {}), false);
  assert.equal("injectedUrl" in (value ?? {}), false);
});

test("returns a named fallback when vision output is malformed", async () => {
  const value = await assessAdLayoutVisualKit(context, { completeVision: async () => "not-json" });

  assert.equal(value.source, "fallback");
  assert.deepEqual(value.assets, {});
  assert.ok(value.warnings.length > 0);
});

test("sends identity reference and only selected non-identity visual-kit roles", async () => {
  const received: { roles: string[]; urls: string[] }[] = [];
  const value = await assessAdLayoutVisualKit(context, {
    loadAsDataUrl: async (url) => `data:image/png;base64,${url}`,
    completeVision: async ({ imageRoles, imageDataUrls }) => {
      received.push({ roles: imageRoles, urls: imageDataUrls });
      return validJson;
    },
  });

  assert.equal(value.source, "vision");
  assert.deepEqual(received, [{
    roles: ["hero", "background", "detail", "benefit", "decoration"],
    urls: ["data:image/png;base64,hero", "data:image/png;base64,background", "data:image/png;base64,detail", "data:image/png;base64,benefit", "data:image/png;base64,decoration"],
  }]);
});

test("falls back when the provider is not configured", async () => {
  const value = await assessAdLayoutVisualKit(context, { apiKey: "" });

  assert.equal(value.source, "fallback");
  assert.match(value.warnings[0] ?? "", /未設定/);
});
