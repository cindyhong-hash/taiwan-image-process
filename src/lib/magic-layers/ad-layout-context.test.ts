import assert from "node:assert/strict";
import test from "node:test";
import { createAdLayoutContext, inventoryFromAssets } from "./ad-layout-context.ts";

test("normalizes legacy visual-kit roles and protects product identity assets", () => {
  const inventory = inventoryFromAssets({
    heroImageUrl: "https://assets.example/hero.png",
    assets: [
      { assetRole: "texture", imageUrl: "https://assets.example/texture.png" },
      { assetRole: "lifestyle", imageUrl: "https://assets.example/lifestyle.png" },
      { assetRole: "background", imageUrl: "https://assets.example/background.png" },
      { assetRole: "decoration", imageUrl: "https://assets.example/drop.png" },
    ],
    logoUrl: "https://assets.example/logo.png",
  });

  assert.equal(inventory.byRole.detail?.imageUrl, "https://assets.example/texture.png");
  assert.equal(inventory.byRole.benefit?.imageUrl, "https://assets.example/lifestyle.png");
  assert.equal(inventory.byRole.hero?.identityCritical, true);
  assert.equal(inventory.logo?.identityCritical, true);
  assert.equal(inventory.byRole.background?.identityCritical, false);
});

test("builds a safe brand and product context from nullable persisted values", () => {
  const context = createAdLayoutContext({
    product: {
      id: "product-1", name: "雪白除毛刀", description: "溫和保濕", category: "保養",
      heroImageUrl: "https://assets.example/hero.png", visualProfileJson: "not-json", primaryColorOverride: null,
    },
    client: {
      name: "SALON+", description: "清爽日系", industry: "美妝", primaryColor: "#63a9e5", secondaryColor: "#dceeff",
      toneLabels: '["清新", "乾淨"]', paletteColors: '["#63a9e5", "#ffffff"]', logoUrls: '["https://assets.example/logo.png"]',
    },
    assets: [{ assetRole: "background", imageUrl: "https://assets.example/background.png" }],
  });

  assert.equal(context.product.profile, null);
  assert.deepEqual(context.brand.palette, ["#63a9e5", "#ffffff"]);
  assert.deepEqual(context.brand.tones, ["清新", "乾淨"]);
  assert.equal(context.inventory.byRole.hero?.imageUrl, "https://assets.example/hero.png");
  assert.equal(context.brand.primaryColor, "#63a9e5");
});
