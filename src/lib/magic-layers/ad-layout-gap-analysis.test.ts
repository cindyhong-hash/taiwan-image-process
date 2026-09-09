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
