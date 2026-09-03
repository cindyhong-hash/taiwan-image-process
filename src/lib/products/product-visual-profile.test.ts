import assert from "node:assert/strict";
import test from "node:test";
import { computeProductVisualSourceHash, parseProductVisualProfile } from "./product-visual-profile.ts";

test("accepts a complete version 1 beauty-device profile", () => {
  const profile = parseProductVisualProfile({
    version: 1,
    productType: "女性電動除毛刀",
    productArchetype: "beauty_device",
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
  });

  assert.equal(profile?.productArchetype, "beauty_device");
});

test("rejects an unknown archetype", () => {
  assert.equal(parseProductVisualProfile({ version: 1, productArchetype: "medical_device" }), null);
});

test("source hash changes when product images or description change", () => {
  const base = {
    name: "美體除毛刀",
    description: "纖巧筆型",
    category: "居家生活",
    rawImageUrls: ["a.jpg"],
    heroImageUrl: "hero.png",
  };

  assert.notEqual(
    computeProductVisualSourceHash(base),
    computeProductVisualSourceHash({ ...base, rawImageUrls: ["a.jpg", "b.jpg"] }),
  );
  assert.notEqual(
    computeProductVisualSourceHash(base),
    computeProductVisualSourceHash({ ...base, description: "圓形刀頭" }),
  );
});
