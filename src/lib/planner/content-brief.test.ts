import assert from "node:assert/strict";
import test from "node:test";

import { buildContentBrief, buildPlannerActivityDraft, plannerActivityDestination } from "./content-brief.ts";

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

test("buildPlannerActivityDraft maps a carousel brief into an editable draft", () => {
  const payload = buildPlannerActivityDraft({
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
    sourceSignals: [],
  });

  assert.deepEqual(payload, {
    theme: "秋季保養三步驟",
    focusPoint: "秋季保養三步驟",
    titleText: "秋季保養三步驟",
    imagePrompt: "用簡單步驟介紹換季保養\n\nCampaign 補充：主打溫和保濕",
    productImageUrl: "/product.jpg",
    productImageUrls: JSON.stringify(["/product.jpg"]),
    referenceImageUrls: "[]",
    selectedComponentIds: "[]",
    layoutId: "three-h-top",
    genMode: "unified",
    cells: "[]",
    status: "DRAFT",
  });
});

test("plannerActivityDestination routes single and carousel drafts to their existing editors", () => {
  assert.equal(plannerActivityDestination("client-1", "activity-1", "SINGLE"), "/clients/client-1/activities/activity-1/edit");
  assert.equal(plannerActivityDestination("client-1", "activity-1", "CAROUSEL"), "/clients/client-1/activities/new/multi?edit=activity-1");
});
