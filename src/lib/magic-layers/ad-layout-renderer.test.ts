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
    "layer_bg", "background_wash", "product_color_halo", "product_grounding_shadow", "product_highlight", "product_1", "decoration_1", "text_safe_panel", "text_title", "text_sub", "logo_1",
  ]);
  assert.equal(layers.some((layer) => layer.id === "texture_1" || layer.id === "benefit_1"), false);
  assert.equal((layers.find((layer) => layer.id === "text_safe_panel")?.meta.shape as { kind?: string }).kind, "rect");
});

test("renders distinct editable integration layers for trusted surface grounding", () => {
  const scene = resolveAdLayoutDesignSpecs({
    ...input,
    purpose: "scene",
    compositionAdvice: { source: "vision", sceneGrounding: "surface", warnings: [] },
  }).find((spec) => spec.direction === "scene-led");
  assert.ok(scene);

  const layers = renderAdLayoutSpec(scene);
  const effectIds = ["product_cast_shadow", "product_contact_shadow", "product_highlight", "product_reflection_highlight"];
  const effects = layers.filter((layer) => effectIds.includes(layer.id));
  const product = layers.find((layer) => layer.id === "product_1");

  assert.ok(product);
  assert.equal(product.image, "hero");
  assert.ok(effects.some((layer) => layer.id === "product_cast_shadow"));
  assert.ok(effects.some((layer) => layer.id === "product_contact_shadow"));
  assert.ok(effects.some((layer) => layer.id === "product_highlight"));
  if (scene.productIntegration?.reflectionHighlight) {
    assert.ok(effects.some((layer) => layer.id === "product_reflection_highlight"));
  }
  assert.ok(effects.every((layer) => layer.editable && layer.image === null && Boolean(layer.meta.shape)));
  assert.ok(effects.every((layer) => layer.zIndex < product.zIndex));
  assert.equal(layers.some((layer) => layer.id === "product_color_halo" || layer.id === "product_grounding_shadow"), false);
});

test("renders floating grounding and brand halo without contact or reflection layers", () => {
  const productFocus = resolveAdLayoutDesignSpecs(input).find((spec) => spec.direction === "product-focus");
  assert.ok(productFocus);
  const layers = renderAdLayoutSpec(productFocus);

  assert.ok(layers.some((layer) => layer.id === "product_grounding_shadow"));
  assert.ok(layers.some((layer) => layer.id === "product_color_halo"));
  assert.ok(layers.some((layer) => layer.id === "product_highlight"));
  assert.equal(layers.some((layer) => layer.id === "product_contact_shadow"), false);
  assert.equal(layers.some((layer) => layer.id === "product_reflection_highlight"), false);
});

test("renders the polish wash as an editable full-canvas gradient above the image background", () => {
  const productFocus = resolveAdLayoutDesignSpecs(input).find((spec) => spec.direction === "product-focus");
  assert.ok(productFocus);
  assert.equal(productFocus.polishTreatment.backgroundWash, "soft-light");

  const layers = renderAdLayoutSpec(productFocus);
  const background = layers.find((layer) => layer.id === "layer_bg");
  const wash = layers.find((layer) => layer.id === "background_wash");
  const product = layers.find((layer) => layer.id === "product_1");

  assert.ok(background && wash && product);
  assert.equal(wash.image, null);
  assert.equal(wash.editable, true);
  assert.deepEqual(wash.bbox, { x: 0, y: 0, w: 1024, h: 1280 });
  assert.equal((wash.meta.shape as { gradient?: { axis?: string } }).gradient?.axis, "vertical");
  assert.ok(background.zIndex < wash.zIndex);
  assert.ok(wash.zIndex < product.zIndex);
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

test("fits the identity-critical product inside its template zone without stretching it", () => {
  const productFocus = resolveAdLayoutDesignSpecs({ ...input, productAspectRatio: 0.35 })
    .find((spec) => spec.direction === "product-focus");
  assert.ok(productFocus);
  const product = renderAdLayoutSpec(productFocus).find((layer) => layer.id === "product_1");

  assert.ok(product);
  assert.ok(Math.abs(product.width / product.height - 0.35) < 0.01);
  assert.ok(product.width < 1024 * 0.38);
  assert.ok(product.height <= 1280 * 0.85);
});

test("renders an opaque editable background shape when no image background exists", () => {
  const productFocus = resolveAdLayoutDesignSpecs({ ...input, assets: { hero: "hero" } })
    .find((spec) => spec.direction === "product-focus");
  assert.ok(productFocus);

  const layers = renderAdLayoutSpec(productFocus);
  const background = layers[0];

  assert.equal(background.id, "background_base");
  assert.equal(background.type, "background");
  assert.equal(background.semanticId, "background");
  assert.equal(background.image, null);
  assert.deepEqual(background.bbox, { x: 0, y: 0, w: 1024, h: 1280 });
  assert.equal(background.meta.opacity, 1);
  assert.deepEqual(background.meta.shape, {
    kind: "rect", fill: "#f8f9fc", stroke: "none", strokeWidth: 0, radius: 0,
  });
  assert.ok(background.zIndex < (layers.find((layer) => layer.id === "product_1")?.zIndex ?? -1));
});
