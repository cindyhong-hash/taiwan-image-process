import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdLayoutDesignSpecs } from "./ad-layout-design-spec.ts";
import { validateAdLayoutSpec } from "./ad-layout-quality.ts";

const input = {
  canvas: { width: 1024, height: 1280, ratio: "4:5" },
  assets: { background: "background", hero: "hero", detail: "detail", benefit: "benefit", decoration: "drop" },
  purpose: "product" as const,
  typography: { headline: "溫和去角質", dark: "#223344", light: "#ffffff", accent: "#66aee0", treatment: "light-panel" as const },
};

test("flags a missing hero and excessive decoration before a spec is rendered", () => {
  const [base] = resolveAdLayoutDesignSpecs(input);
  const checks = validateAdLayoutSpec({
    ...base,
    assets: { ...base.assets, product: undefined, decorations: [
      { role: "decoration", imageUrl: "one" }, { role: "decoration", imageUrl: "two" }, { role: "decoration", imageUrl: "three" },
    ] },
  });

  assert.equal(checks.find((check) => check.id === "hero-present")?.passed, false);
  assert.equal(checks.find((check) => check.id === "decoration-budget")?.passed, false);
});

test("accepts a restrained product design with a safe text treatment", () => {
  const [base] = resolveAdLayoutDesignSpecs(input);
  const checks = validateAdLayoutSpec(base);

  assert.equal(checks.every((check) => check.passed), true);
});

test("allows a single benefit visual when the brief is benefit-led", () => {
  const [base] = resolveAdLayoutDesignSpecs({ ...input, purpose: "benefit" });
  const checks = validateAdLayoutSpec(base);

  assert.equal(base.assets.support?.role, "benefit");
  assert.equal(checks.find((check) => check.id === "direction-support")?.passed, true);
});

test("flags a product that leaves the canvas", () => {
  const [base] = resolveAdLayoutDesignSpecs(input);
  const checks = validateAdLayoutSpec({
    ...base,
    layout: { ...base.layout!, product: { ...base.layout!.product, x: -1 } },
  });

  assert.equal(checks.find((check) => check.id === "product-bounds")?.passed, false);
});

test("flags a visible product without an integration treatment", () => {
  const [base] = resolveAdLayoutDesignSpecs(input);
  const checks = validateAdLayoutSpec({ ...base, productIntegration: undefined });

  assert.equal(checks.find((check) => check.id === "product-integration")?.passed, false);
});

test("flags product and headline overlap in resolved geometry", () => {
  const [base] = resolveAdLayoutDesignSpecs(input);
  const checks = validateAdLayoutSpec({
    ...base,
    layout: { ...base.layout!, headline: { ...base.layout!.product } },
  });

  assert.equal(checks.find((check) => check.id === "product-copy-overlap")?.passed, false);
});
