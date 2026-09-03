import assert from "node:assert/strict";
import test from "node:test";
import { compileImageSetPrompt } from "./image-set-prompts.ts";
import { planImageSetRoles } from "./image-set-roles.ts";
import type { ImageSetArtDirection } from "./product-visual-analysis.ts";
import type { ProductVisualProfile } from "./product-visual-profile.ts";

const product = {
  id: "product-1",
  clientId: "client-1",
  name: "女性電動除毛刀",
  category: "美容儀器",
  primaryColorOverride: null,
  heroImageUrl: "hero.png",
};

const beautyDeviceProfile: ProductVisualProfile = {
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
};

const artDirection: ImageSetArtDirection = {
  concept: "女性電動除毛刀的一致產品攝影",
  palette: { dominant: ["白", "冰藍", "銀"], accent: ["#ffeb85"] },
  lighting: "柔和、乾淨的產品攝影光線",
  materials: ["霧面塑膠", "金屬刀網"],
  backgroundLanguage: "明亮浴室",
  cameraLanguage: "清晰產品攝影，保留真實比例",
  consistencyRules: ["所有畫面視為同一產品的不同視角。"],
};

test("product roles contain identity locks", () => {
  const role = planImageSetRoles(beautyDeviceProfile)[0];
  const prompt = compileImageSetPrompt({ product, profile: beautyDeviceProfile, artDirection, role });

  for (const detail of beautyDeviceProfile.appearance.distinctiveDetails) {
    assert.match(prompt, new RegExp(detail));
  }
  assert.match(prompt, /不得改變|100% unchanged/);
  assert.match(prompt, /\[ROLE OBJECTIVE\][\s\S]*\[PRODUCT FACTS\][\s\S]*\[MUST PRESERVE\][\s\S]*\[SHARED ART DIRECTION\][\s\S]*\[COMPOSITION AND CAMERA\][\s\S]*\[MUST NOT SHOW\]/);
});

test("background forbids the product and reserves layout space", () => {
  const role = planImageSetRoles(beautyDeviceProfile)[3];
  const prompt = compileImageSetPrompt({ product, profile: beautyDeviceProfile, artDirection, role });

  assert.match(prompt, /不出現任何產品/);
  assert.match(prompt, /留白/);
});

test("brand yellow remains an accent rather than the dominant palette", () => {
  const role = planImageSetRoles(beautyDeviceProfile)[0];
  const prompt = compileImageSetPrompt({ product, profile: beautyDeviceProfile, artDirection, role });

  assert.match(prompt, /dominant.*白.*冰藍.*銀/i);
  assert.match(prompt, /accent.*#ffeb85/i);
});
