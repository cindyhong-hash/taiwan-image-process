import assert from "node:assert/strict";
import test from "node:test";
import { previewAssetsForOption, previewModelForOption, selectAdLayoutOption, type AdLayoutOption } from "./ad-layout-options.ts";

const options: AdLayoutOption[] = [
  { id: "product-focus", label: "商品主視覺", description: "商品為主", layers: [] },
  { id: "editorial", label: "編輯留白感", description: "文字為主", layers: [] },
];

test("returns only the user-selected layout option for the existing editor seed", () => {
  assert.equal(selectAdLayoutOption(options, "editorial")?.id, "editorial");
  assert.equal(selectAdLayoutOption(options, "missing"), null);
});

test("derives preview imagery from the selected option layers rather than the whole asset pool", () => {
  const option: AdLayoutOption = {
    id: "product-focus", label: "商品主視覺", description: "", layers: [
      { id: "layer_bg", image: "background" },
      { id: "product_1", image: "hero" },
      { id: "decoration_1", image: "drop" },
    ] as unknown as AdLayoutOption["layers"],
  };

  assert.deepEqual(previewAssetsForOption(option), {
    backgroundUrl: "background", productUrl: "hero", supportUrl: undefined, decorationUrl: "drop",
  });
});

test("derives preview geometry from rendered layer bounds instead of direction-specific CSS", () => {
  const model = previewModelForOption({
    id: "editorial", label: "編輯", description: "", layers: [
      { id: "product_1", image: "product-image", x: 321, y: 456, width: 111, height: 222, bbox: { x: 321, y: 456, w: 111, h: 222 } },
      { id: "text_title", image: null, x: 50, y: 90, width: 200, height: 80, bbox: { x: 50, y: 90, w: 200, h: 80 }, meta: { style: { text: "真正的標題", color: "#123456" } } },
    ] as unknown as AdLayoutOption["layers"],
  }, { width: 600, height: 800 });

  assert.deepEqual(model.product?.rect, { x: 53.5, y: 57, w: 18.5, h: 27.75 });
  assert.equal(model.headline?.text, "真正的標題");
  assert.equal(model.headline?.color, "#123456");
});
