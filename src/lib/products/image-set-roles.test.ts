import assert from "node:assert/strict";
import test from "node:test";
import { planImageSetRoles } from "./image-set-roles.ts";
import type { ProductVisualProfile } from "./product-visual-profile.ts";

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

test("beauty devices receive detail and usage roles instead of texture and ingredient", () => {
  const roles = planImageSetRoles(beautyDeviceProfile);

  assert.deepEqual(roles.map((role) => role.role), ["hero", "detail", "lifestyle", "background", "decoration"]);
  assert.match(roles[1].label, /刀頭|功能細節/);
  assert.match(roles[1].sceneCn, /刀頭|按鍵/);
  assert.match(roles[2].sceneCn, /護理|使用情境/);
  assert.match(roles[2].sceneCn, /腿部日常修整/);
});

test("sparse archetype profiles keep detail and lifestyle copy generic", () => {
  const inventedNouns = /刀頭|按鍵|質地|成分|食材|餐桌|享用|介面|接口|布料|五金|車縫|穿搭/;

  for (const productArchetype of ["skincare", "food_beverage", "electronics", "fashion"] as const) {
    const roles = planImageSetRoles({
      ...beautyDeviceProfile,
      productType: "測試商品",
      productArchetype,
      appearance: {
        shape: "",
        materials: [],
        colors: [],
        distinctiveDetails: [],
        visibleTextOrLogos: [],
      },
      useCases: [],
      suitableScenes: [],
      visualMotifs: [],
      prohibitedChanges: [],
      confidence: 0,
      sourceImageCount: 0,
    });

    assert.doesNotMatch(roles[1].sceneCn, inventedNouns, `${productArchetype} detail should not invent facts`);
    assert.doesNotMatch(roles[2].sceneCn, inventedNouns, `${productArchetype} lifestyle should not invent facts`);
    assert.match(roles[1].sceneCn, /可見|商品/);
    assert.match(roles[2].sceneCn, /使用情境/);
  }
});

test("unknown products still receive five safe generic roles", () => {
  const roles = planImageSetRoles({
    ...beautyDeviceProfile,
    productType: "未知商品",
    productArchetype: "other",
    appearance: {
      shape: "",
      materials: [],
      colors: [],
      distinctiveDetails: [],
      visibleTextOrLogos: [],
    },
    useCases: [],
    suitableScenes: [],
    visualMotifs: [],
    prohibitedChanges: [],
    confidence: 0,
    sourceImageCount: 0,
  });

  assert.equal(roles.length, 5);
  assert.deepEqual(roles.map((role) => role.role), ["hero", "detail", "lifestyle", "background", "decoration"]);
  assert.equal(roles[3].role, "background");
  assert.match(roles[3].sceneCn, /不出現任何產品/);
});
