import assert from "node:assert/strict";
import test from "node:test";

import { buildQuickActivityPayload, classifyQuickCreate } from "./quick-create.ts";

test("classifyQuickCreate sends carousel and multi-image requests to the multi editor", () => {
  assert.equal(classifyQuickCreate({ prompt: "請做一組三張輪播貼文，介紹新品特色", attachmentCount: 0 }), "multi");
  assert.equal(classifyQuickCreate({ prompt: "系列圖，每一頁介紹不同使用方式", attachmentCount: 1 }), "multi");
});

test("classifyQuickCreate sends underspecified text-only requests to the full single editor", () => {
  assert.equal(classifyQuickCreate({ prompt: "女刀海報", attachmentCount: 0 }), "single");
  assert.equal(classifyQuickCreate({ prompt: "   ", attachmentCount: 0 }), "single");
});

test("classifyQuickCreate directly generates sufficiently described or image-grounded requests", () => {
  assert.equal(classifyQuickCreate({ prompt: "夏日海灘上的女性除毛刀產品情境圖", attachmentCount: 0 }), "direct");
  assert.equal(classifyQuickCreate({ prompt: "夏日氛圍", attachmentCount: 1 }), "direct");
});

test("buildQuickActivityPayload uses the selected ratio and existing generation defaults", () => {
  assert.deepEqual(buildQuickActivityPayload({
    clientId: "client-1",
    prompt: " 清爽明亮的夏季產品情境圖 ",
    imageRatio: "4:5",
    productImageUrls: ["/product.png"],
    referenceImageUrls: ["/reference.png"],
  }), {
    clientId: "client-1",
    requiredText: "",
    imagePrompt: "清爽明亮的夏季產品情境圖",
    imageRatio: "4:5",
    customW: 1200,
    customH: 1500,
    imageModel: "google/gemini-3-pro-image-preview",
    productImageUrls: ["/product.png"],
    referenceImageUrls: ["/reference.png"],
    selectedComponentIds: [],
    layoutId: "single",
  });
});
