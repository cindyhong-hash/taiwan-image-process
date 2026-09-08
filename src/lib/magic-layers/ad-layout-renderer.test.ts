import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdLayoutDesignSpecs } from "./ad-layout-design-spec.ts";
import { renderAdLayoutSpec } from "./ad-layout-renderer.ts";

const input = {
  canvas: { width: 1024, height: 1280, ratio: "4:5" },
  assets: {
    background: "background", hero: "hero", detail: "detail", benefit: "benefit", decoration: "drop",
  },
  purpose: "product" as const,
  typography: { headline: "溫和去角質", subtitle: "還你柔嫩光滑肌", dark: "#23344a", light: "#ffffff", accent: "#66aee0", treatment: "light-panel" as const },
};

test("renders a focused composition without support-image clutter", () => {
  const productFocus = resolveAdLayoutDesignSpecs(input).find((spec) => spec.direction === "product-focus");
  assert.ok(productFocus);
  const layers = renderAdLayoutSpec(productFocus, { logoUrl: "logo" });

  assert.deepEqual(layers.map((layer) => layer.id), [
    "layer_bg", "product_shadow", "product_1", "decoration_1", "text_safe_panel", "text_title", "text_sub", "logo_1",
  ]);
  assert.equal(layers.some((layer) => layer.id === "texture_1" || layer.id === "benefit_1"), false);
  assert.equal((layers.find((layer) => layer.id === "text_safe_panel")?.meta.shape as { kind?: string }).kind, "rect");
});

test("renders scene support behind product and copy", () => {
  const scene = resolveAdLayoutDesignSpecs({ ...input, purpose: "scene" }).find((spec) => spec.direction === "scene-led");
  assert.ok(scene);
  const layers = renderAdLayoutSpec(scene);
  const support = layers.find((layer) => layer.id === "texture_1" || layer.id === "benefit_1");
  const product = layers.find((layer) => layer.id === "product_1");
  const text = layers.find((layer) => layer.id === "text_title");

  assert.ok(support);
  assert.ok(product);
  assert.ok(text);
  assert.ok(support.zIndex < product.zIndex);
  assert.ok(product.zIndex < text.zIndex);
  assert.ok(layers.every((layer) => ["background", "product", "object", "decoration", "independent_text"].includes(layer.type)));
});
