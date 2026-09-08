import assert from "node:assert/strict";
import test from "node:test";
import { buildAdLayoutCandidates } from "./ad-layout-recipes.ts";

const input = {
  backgroundUrl: "data:image/png;base64,",
  heroUrl: "data:image/png;base64,",
  textureUrl: "https://assets.example/texture.png",
  benefitUrl: "https://assets.example/benefit.png",
  decorationUrl: "data:image/png;base64,",
  title: "肌膚觸感，從此不同",
  subtitle: "水感保養日常",
  brandColor: "#6d4aff",
  canvasWidth: 1024,
  canvasHeight: 1280,
} as const;

function layer(layers: Awaited<ReturnType<typeof buildAdLayoutCandidates>>[number]["layers"], id: string) {
  return layers.find((item) => item.id === id);
}

test("creates three visually distinct product layout directions", async () => {
  const options = await buildAdLayoutCandidates({ ...input, purpose: "product" });

  assert.deepEqual(options.map((option) => option.id), ["product-focus", "editorial", "scene-led"]);
  assert.notDeepEqual(layer(options[0].layers, "product_1")?.bbox, layer(options[1].layers, "product_1")?.bbox);
  assert.notDeepEqual(layer(options[1].layers, "text_title")?.bbox, layer(options[2].layers, "text_title")?.bbox);
});

test("keeps texture photographic and benefit visual as independent image layers", async () => {
  const [option] = await buildAdLayoutCandidates({ ...input, purpose: "benefit" });

  assert.equal(layer(option.layers, "texture_1")?.image, input.textureUrl);
  assert.equal(layer(option.layers, "texture_1")?.type, "object");
  assert.equal(layer(option.layers, "benefit_1")?.image, input.benefitUrl);
  assert.equal(layer(option.layers, "benefit_1")?.type, "object");
});

test("moves hierarchy for each stated purpose instead of scaling one template", async () => {
  const [product] = await buildAdLayoutCandidates({ ...input, purpose: "product" });
  const [benefit] = await buildAdLayoutCandidates({ ...input, purpose: "benefit" });
  const [scene] = await buildAdLayoutCandidates({ ...input, purpose: "scene" });
  const [promo] = await buildAdLayoutCandidates({ ...input, purpose: "promo" });

  assert.notDeepEqual(layer(product.layers, "product_1")?.bbox, layer(benefit.layers, "product_1")?.bbox);
  assert.notDeepEqual(layer(benefit.layers, "benefit_1")?.bbox, layer(scene.layers, "benefit_1")?.bbox);
  assert.ok(promo.layers.some((item) => item.id === "promo_panel"));
});
