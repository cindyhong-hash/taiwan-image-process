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

test("new batches plan a composable ad-asset pack instead of five product photographs", () => {
  const roles = planImageSetRoles(beautyDeviceProfile);

  assert.deepEqual(roles.map((role) => role.role), ["hero", "detail", "background", "benefit", "decoration"]);
  assert.deepEqual(roles.map((role) => role.label), ["商品主體", "質地細節", "情境背景", "賣點視覺", "裝飾元素"]);
  assert.equal(roles[0].path, "cutout");
  assert.equal(roles[0].cutout, true);
  assert.equal(roles[1].path, "text");
  assert.equal(roles[2].path, "text");
  assert.equal(roles[3].path, "text");
  assert.match(roles[1].sceneCn, /質地|液體|泡沫/);
  assert.match(roles[2].sceneCn, /明亮浴室/);
  assert.match(roles[2].mustNotShow.join("\n"), /產品|Logo|文字/);
  assert.match(roles[3].sceneCn, /腿部日常修整/);
  assert.match(roles[3].mustNotShow.join("\n"), /產品|Logo/);
  assert.match(roles[4].sceneCn, /銀藍曲線/);
  assert.match(roles[4].mustNotShow.join("\n"), /完整場景/);
});

test("sparse archetype profiles keep ad-asset copy generic without inventing product facts", () => {
  const inventedNouns = /刀頭|按鍵|成分|食材|餐桌|享用|介面|接口|布料|五金|車縫|穿搭/;

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

    assert.doesNotMatch(roles[1].sceneCn, inventedNouns, `${productArchetype} texture should not invent facts`);
    assert.doesNotMatch(roles[3].sceneCn, inventedNouns, `${productArchetype} benefit should not invent facts`);
    assert.match(roles[1].sceneCn, /質地|抽象/);
    assert.match(roles[3].sceneCn, /賣點|功效|抽象/);
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
  assert.deepEqual(roles.map((role) => role.role), ["hero", "detail", "background", "benefit", "decoration"]);
  assert.equal(roles[2].role, "background");
  assert.match(roles[2].sceneCn, /不出現任何產品/);
});
