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

test("abstract benefit visuals receive supplied use-case context without product identity locks", () => {
  const role = planImageSetRoles(beautyDeviceProfile).find(({ role }) => role === "benefit")!;
  const prompt = compileImageSetPrompt({ product, profile: beautyDeviceProfile, artDirection, role });

  assert.match(prompt, /Supplied use cases: 腿部日常修整/);
  assert.match(prompt, /liquid, particles, soft light/i);
  assert.match(prompt, /actual product|Logo/i);
  assert.doesNotMatch(prompt, /Product name: 女性電動除毛刀/);
  assert.doesNotMatch(prompt, /Visible text or logos: Schick/);
  assert.doesNotMatch(prompt, /\[MUST PRESERVE\]/);
});

test("background forbids the product and reserves layout space", () => {
  const role = planImageSetRoles(beautyDeviceProfile).find(({ role }) => role === "background")!;
  const prompt = compileImageSetPrompt({ product, profile: beautyDeviceProfile, artDirection, role });

  assert.match(prompt, /不出現任何產品/);
  assert.match(prompt, /留白/);
  assert.match(prompt, /product-free/i);
  assert.match(prompt, /no product depiction/i);
  assert.doesNotMatch(prompt, /Product name: 女性電動除毛刀/);
  assert.doesNotMatch(prompt, /一致產品攝影/);
});

test("brand yellow remains an accent rather than the dominant palette", () => {
  const role = planImageSetRoles(beautyDeviceProfile)[0];
  const prompt = compileImageSetPrompt({ product, profile: beautyDeviceProfile, artDirection, role });

  assert.match(prompt, /dominant.*白.*冰藍.*銀/i);
  // accent 仍要提到、且維持「僅作點綴」語意
  assert.match(prompt, /accent.*never dominant/i);
  // 但品牌色 hex 不得出現在生圖 prompt——否則影像模型會把色碼當文字/浮水印畫出來
  assert.doesNotMatch(prompt, /#[0-9a-f]{3,8}\b/i);
});

test("describes distinct valid brand hex colors without exposing raw color codes", () => {
  const role = planImageSetRoles(beautyDeviceProfile)[0];
  const yellowPrompt = compileImageSetPrompt({ product, profile: beautyDeviceProfile, artDirection, role });
  const violetPrompt = compileImageSetPrompt({
    product,
    profile: beautyDeviceProfile,
    artDirection: { ...artDirection, palette: { dominant: ["#7c3aed"], accent: ["#ffeb85"] } },
    role,
  });

  assert.match(yellowPrompt, /warm light yellow/i);
  assert.match(violetPrompt, /dominant palette: vivid violet/i);
  assert.match(violetPrompt, /accent palette: warm light yellow/i);
  assert.doesNotMatch(`${yellowPrompt}\n${violetPrompt}`, /#[0-9a-f]{3,8}\b/i);
});

test("handles alpha hex conservatively and drops invalid hash-prefixed colors", () => {
  const role = planImageSetRoles(beautyDeviceProfile)[0];
  const prompt = compileImageSetPrompt({
    product,
    profile: beautyDeviceProfile,
    artDirection: {
      ...artDirection,
      palette: {
        dominant: ["#73ea", "#73ea", "#not-a-color", "冰藍"],
        accent: ["#ffeb8580", "#ffeb8580", "#12345"],
      },
    },
    role,
  });

  assert.match(prompt, /dominant palette: translucent vivid violet、冰藍/i);
  assert.match(prompt, /accent palette: translucent warm light yellow/i);
  assert.doesNotMatch(prompt, /not-a-color|#12345|#[0-9a-f]{3,8}\b/i);
  assert.equal((prompt.match(/translucent vivid violet/gi) ?? []).length, 1);
  assert.equal((prompt.match(/translucent warm light yellow/gi) ?? []).length, 1);
});
