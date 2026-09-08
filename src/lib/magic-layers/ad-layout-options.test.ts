import assert from "node:assert/strict";
import test from "node:test";
import { previewAssetsForOption, selectAdLayoutOption, type AdLayoutOption } from "./ad-layout-options.ts";

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
    ] as AdLayoutOption["layers"],
  };

  assert.deepEqual(previewAssetsForOption(option), {
    backgroundUrl: "background", productUrl: "hero", supportUrl: undefined, decorationUrl: "drop",
  });
});
