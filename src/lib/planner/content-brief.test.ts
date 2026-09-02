import assert from "node:assert/strict";
import test from "node:test";

import { buildContentBrief } from "./content-brief.ts";

test("buildContentBrief normalizes an editable planner item with campaign products", () => {
  const brief = buildContentBrief({
    id: "item-1",
    topic: "秋季保養三步驟",
    contentDirection: "用簡單步驟介紹換季保養",
    campaignId: "campaign-1",
    format: "CAROUSEL",
    platforms: ["Instagram", "Unknown", "Instagram"],
    recommendationReason: "換季需求增加",
    sourceSignals: [{ id: "signal-1", source: "important-date", label: "09/15 換季", score: 0.7 }],
  }, [{
    id: "campaign-1",
    name: "秋季保養",
    description: "主打溫和保濕",
    products: [{ id: "product-1", label: "保濕精華", imageUrl: "/product.jpg" }],
  }]);

  assert.deepEqual(brief, {
    itemId: "item-1",
    campaignId: "campaign-1",
    campaignName: "秋季保養",
    campaignDescription: "主打溫和保濕",
    topic: "秋季保養三步驟",
    contentDirection: "用簡單步驟介紹換季保養",
    format: "CAROUSEL",
    platforms: ["Instagram"],
    products: [{ id: "product-1", label: "保濕精華", imageUrl: "/product.jpg" }],
    recommendationReason: "換季需求增加",
    sourceSignals: [{ id: "signal-1", source: "important-date", label: "09/15 換季", score: 0.7 }],
  });
});

test("buildContentBrief falls back safely when the campaign or format is invalid", () => {
  const brief = buildContentBrief({
    id: "item-2",
    topic: "品牌日常",
    contentDirection: "",
    campaignId: null,
    format: "VIDEO",
    platforms: [],
    recommendationReason: "",
    sourceSignals: [],
  }, []);

  assert.equal(brief.campaignName, "未指定 Campaign");
  assert.equal(brief.format, "SINGLE");
  assert.deepEqual(brief.platforms, []);
  assert.deepEqual(brief.products, []);
});
