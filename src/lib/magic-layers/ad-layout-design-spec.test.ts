import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAdLayoutDesignSpecs,
  validateAndRepairDesignSpec,
} from "./ad-layout-design-spec.ts";
import { createCreativeBrief, selectDesignRecipe } from "./ad-layout-creative-brief.ts";
import { analyzeDesignGaps, planRecipeAssets } from "./ad-layout-gap-analysis.ts";
import type { AdLayoutContext } from "./ad-layout-context.ts";

const input = {
  canvas: { width: 1024, height: 1280, ratio: "4:5" },
  assets: {
    background: "https://assets.example/background.png",
    hero: "https://assets.example/hero.png",
    detail: "https://assets.example/detail.png",
    benefit: "https://assets.example/benefit.png",
    decoration: "https://assets.example/drop.png",
  },
  purpose: "product" as const,
  typography: {
    headline: "溫和去角質",
    subtitle: "還你柔嫩光滑肌",
    dark: "#23344a",
    light: "#ffffff",
    accent: "#66aee0",
  },
};

test("product focus selects a restrained hero composition instead of every asset", () => {
  const specs = resolveAdLayoutDesignSpecs(input);
  const productFocus = specs.find((spec) => spec.direction === "product-focus");

  assert.equal(specs.length, 3);
  assert.deepEqual(productFocus?.assets, {
    background: { role: "background", imageUrl: input.assets.background },
    product: { role: "hero", imageUrl: input.assets.hero },
    support: undefined,
    decorations: [{ role: "decoration", imageUrl: input.assets.decoration }],
  });
});

test("scene-led composition selects one support visual at most", () => {
  const scene = resolveAdLayoutDesignSpecs({ ...input, purpose: "scene" })
    .find((spec) => spec.direction === "scene-led");

  assert.ok(scene);
  assert.equal(scene.assets.support?.role, "detail");
  assert.notEqual(scene.assets.support?.role, "benefit");
  assert.ok(scene.assets.decorations.length <= 2);
});

test("quality validator removes excess visuals and restores a missing hero", () => {
  const [base] = resolveAdLayoutDesignSpecs(input);
  const repaired = validateAndRepairDesignSpec({
    ...base,
    assets: {
      background: base.assets.background,
      product: undefined,
      support: { role: "benefit", imageUrl: "benefit" },
      decorations: [
        { role: "decoration", imageUrl: "one" },
        { role: "decoration", imageUrl: "two" },
        { role: "decoration", imageUrl: "three" },
      ],
    },
  }, input.assets);

  assert.deepEqual(repaired.assets.product, { role: "hero", imageUrl: input.assets.hero });
  assert.ok(repaired.assets.decorations.length <= 2);
  assert.ok(repaired.quality.warnings.length > 0);
});

test("retains the creative brief, selected asset rationale, and gaps that drove the layout", () => {
  const context: AdLayoutContext = {
    product: { id: "product", name: "產品", profile: null },
    brand: { primaryColor: "#66aee0", tones: [], palette: [] },
    inventory: {
      byRole: {
        hero: { role: "hero", imageUrl: input.assets.hero, identityCritical: true, sourceRole: "hero" },
        background: { role: "background", imageUrl: input.assets.background, identityCritical: false, sourceRole: "background" },
        benefit: { role: "benefit", imageUrl: input.assets.benefit, identityCritical: false, sourceRole: "benefit" },
      },
    },
  };
  const brief = createCreativeBrief(context, { purpose: "product", ratio: "4:5", title: input.typography.headline });
  const recipe = selectDesignRecipe(brief);
  const assetPlan = planRecipeAssets(recipe, brief.inventory);
  const gapPlan = analyzeDesignGaps(brief, recipe, brief.inventory);
  const [spec] = resolveAdLayoutDesignSpecs({ ...input, planning: { brief, recipe, assetPlan, gapPlan } });

  assert.equal(spec.creativeBrief?.product.name, "產品");
  assert.equal(spec.recipe?.id, "product-hero");
  assert.equal(spec.assetPlan?.support, undefined);
  assert.ok(spec.gapPlan?.some((gap) => gap.kind === "product-shadow"));
});
