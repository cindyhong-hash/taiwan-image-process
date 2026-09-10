import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDesignGaps, planRecipeAssets } from "./ad-layout-gap-analysis.ts";
import { createCreativeBrief, selectDesignRecipe } from "./ad-layout-creative-brief.ts";
import type { AdLayoutContext } from "./ad-layout-context.ts";

const inventory = {
  byRole: {
    hero: { role: "hero" as const, imageUrl: "hero", identityCritical: true, sourceRole: "hero" },
    background: { role: "background" as const, imageUrl: "background", identityCritical: false, sourceRole: "background" },
    detail: { role: "detail" as const, imageUrl: "detail", identityCritical: false, sourceRole: "detail" },
    benefit: { role: "benefit" as const, imageUrl: "benefit", identityCritical: false, sourceRole: "benefit" },
    decoration: { role: "decoration" as const, imageUrl: "drop", identityCritical: false, sourceRole: "decoration" },
  },
};

const context: AdLayoutContext = {
  product: { id: "product-1", name: "產品", profile: null },
  brand: { primaryColor: "#63a9e5", tones: [], palette: [] },
  inventory,
};

test("product hero omits noisy benefit assets instead of using every asset", () => {
  const brief = createCreativeBrief(context, { purpose: "product", ratio: "4:5" });
  const plan = planRecipeAssets(selectDesignRecipe(brief), inventory);

  assert.equal(plan.support, undefined);
  assert.ok(plan.omitted.some((asset) => asset.role === "benefit" && asset.reason.includes("輔助")));
});

test("reports a missing identity-critical product separately from editor-native gaps", () => {
  const brief = createCreativeBrief({ ...context, inventory: { byRole: { background: inventory.byRole.background } } }, { purpose: "product", ratio: "4:5" });
  const gaps = analyzeDesignGaps(brief, selectDesignRecipe(brief), brief.inventory);

  assert.ok(gaps.some((gap) => gap.kind === "missing-identity-asset"));
  assert.ok(gaps.some((gap) => gap.kind === "product-shadow" && gap.provider === "shape"));
});

test("suggests one explicit non-identity asset only when a selected recipe truly needs it", () => {
  const withoutBackground = { byRole: { hero: inventory.byRole.hero } };
  const sceneBrief = createCreativeBrief({ ...context, inventory: withoutBackground }, { purpose: "scene", ratio: "4:5" });
  const sceneGaps = analyzeDesignGaps(sceneBrief, selectDesignRecipe(sceneBrief), sceneBrief.inventory);
  assert.deepEqual(sceneGaps.filter((gap) => gap.provider === "image-generation"), [{
    kind: "missing-background", provider: "image-generation", role: "background", label: "情境背景", message: "缺少可合成的情境背景，可選擇建立一張不含商品的背景素材",
  }]);

  const benefitBrief = createCreativeBrief({ ...context, inventory: { byRole: { hero: inventory.byRole.hero } } }, { purpose: "benefit", ratio: "4:5" });
  const benefitGaps = analyzeDesignGaps(benefitBrief, selectDesignRecipe(benefitBrief), benefitBrief.inventory);
  assert.ok(benefitGaps.some((gap) => gap.kind === "missing-benefit" && gap.provider === "image-generation" && gap.role === "benefit"));
});

test("never suggests generating an identity-critical product or an already available role", () => {
  const noHeroBrief = createCreativeBrief({ ...context, inventory: { byRole: { background: inventory.byRole.background } } }, { purpose: "scene", ratio: "4:5" });
  assert.equal(analyzeDesignGaps(noHeroBrief, selectDesignRecipe(noHeroBrief), noHeroBrief.inventory).some((gap) => gap.provider === "image-generation"), false);

  const completeSceneBrief = createCreativeBrief(context, { purpose: "scene", ratio: "4:5" });
  assert.equal(analyzeDesignGaps(completeSceneBrief, selectDesignRecipe(completeSceneBrief), completeSceneBrief.inventory).some((gap) => gap.kind === "missing-background"), false);
});
