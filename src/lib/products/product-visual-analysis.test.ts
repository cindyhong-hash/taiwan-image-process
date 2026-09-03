import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeProductVisualProfile,
  buildImageSetArtDirection,
} from "./product-visual-analysis.ts";

const productWithThreeReferences = {
  name: "女性電動除毛刀",
  description: "纖巧筆型除毛刀",
  category: "美容儀器",
  rawImageUrls: ["front.png", "detail.png"],
  heroImageUrl: "hero.png",
};

const beautyDeviceProfile = {
  version: 1 as const,
  productType: "女性電動除毛刀",
  productArchetype: "beauty_device" as const,
  confidence: 0.96,
  appearance: {
    shape: "纖長筆型",
    materials: ["霧面塑膠", "金屬刀網"],
    colors: ["白", "冰藍", "銀"],
    distinctiveDetails: ["圓形刀頭", "冰藍按鍵"],
    visibleTextOrLogos: ["Schick"],
  },
  useCases: ["腿部日常修整"],
  suitableScenes: ["明亮浴室"],
  visualMotifs: ["銀藍曲線"],
  prohibitedChanges: ["不得改變刀頭結構"],
  sourceImageCount: 3,
};

const validBeautyDeviceProfileJson = JSON.stringify(beautyDeviceProfile);

test("sends every raw image and the hero image to vision analysis", async () => {
  const seen: string[] = [];

  const result = await analyzeProductVisualProfile(productWithThreeReferences, {
    loadAsDataUrl: async (url) => `data:image/png;base64,${url}`,
    completeVision: async ({ imageDataUrls }) => {
      seen.push(...imageDataUrls);
      return validBeautyDeviceProfileJson;
    },
  });

  assert.equal(seen.length, 3);
  assert.equal(result.productArchetype, "beauty_device");
});

test("falls back without inventing facts when model JSON is invalid", async () => {
  const result = await analyzeProductVisualProfile(productWithThreeReferences, {
    loadAsDataUrl: async (url) => url,
    completeVision: async () => "not json",
  });

  assert.equal(result.confidence, 0);
  assert.equal(result.appearance.distinctiveDetails.length, 0);
});

test("deduplicates references and caps vision input at five images", async () => {
  const seen: string[] = [];
  await analyzeProductVisualProfile(
    {
      ...productWithThreeReferences,
      rawImageUrls: ["one.png", "two.png", "two.png", "three.png", "four.png", "five.png"],
      heroImageUrl: "six.png",
    },
    {
      loadAsDataUrl: async (url) => `data:image/png;base64,${url}`,
      completeVision: async ({ imageDataUrls }) => {
        seen.push(...imageDataUrls);
        return validBeautyDeviceProfileJson;
      },
    },
  );

  assert.deepEqual(seen, [
    "data:image/png;base64,one.png",
    "data:image/png;base64,two.png",
    "data:image/png;base64,three.png",
    "data:image/png;base64,four.png",
    "data:image/png;base64,five.png",
  ]);
});

test("uses product colors as dominant and brand color as accent", () => {
  const art = buildImageSetArtDirection(beautyDeviceProfile, {
    primaryColor: "#ffeb85",
    toneLabels: ["清新"],
  });

  assert.deepEqual(art.palette.dominant, ["白", "冰藍", "銀"]);
  assert.deepEqual(art.palette.accent, ["#ffeb85"]);
});
