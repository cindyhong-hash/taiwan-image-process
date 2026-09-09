import assert from "node:assert/strict";
import test from "node:test";
import { createCreativeBrief, selectDesignRecipe } from "./ad-layout-creative-brief.ts";
import type { AdLayoutContext } from "./ad-layout-context.ts";

const context: AdLayoutContext = {
  product: { id: "product-1", name: "雪白除毛刀", description: "溫和保濕", category: "保養", profile: null },
  brand: { name: "SALON+", primaryColor: "#63a9e5", tones: ["清新"], palette: ["#63a9e5"] },
  inventory: {
    byRole: {
      hero: { role: "hero", imageUrl: "hero", identityCritical: true, sourceRole: "hero" },
      background: { role: "background", imageUrl: "background", identityCritical: false, sourceRole: "background" },
      benefit: { role: "benefit", imageUrl: "benefit", identityCritical: false, sourceRole: "benefit" },
    },
  },
};

test("selects a product-hero recipe from a product brief", () => {
  const brief = createCreativeBrief(context, { purpose: "product", ratio: "4:5", title: "溫和去角質" });
  const recipe = selectDesignRecipe(brief);

  assert.equal(recipe.id, "product-hero");
  assert.equal(recipe.supportPolicy, "none");
  assert.equal(brief.userCopy.headline, "溫和去角質");
});

test("selects lifestyle and benefit recipes without treating every asset as required", () => {
  const lifestyle = selectDesignRecipe(createCreativeBrief(context, { purpose: "scene", ratio: "9:16" }));
  const benefit = selectDesignRecipe(createCreativeBrief(context, { purpose: "benefit", ratio: "1:1" }));

  assert.equal(lifestyle.id, "lifestyle");
  assert.equal(lifestyle.supportPolicy, "one-detail-first");
  assert.equal(benefit.id, "benefit-focus");
  assert.equal(benefit.supportPolicy, "one-benefit-first");
});
