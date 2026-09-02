import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlannerContext,
  hasUsableCampaignProducts,
  groundStrategyWithoutProducts,
  hasUngroundedProductClaim,
  NO_PRODUCT_TOPIC_TEMPLATES,
  productsNeedingImageAnalysis,
  type PlannerContextInput,
} from "./planner-context.ts";

const input: PlannerContextInput = {
  client: {
    name: "舒適牌女刀",
    description: "為女性設計的除毛與肌膚護理品牌",
    industry: "個人護理",
    toneLabels: '["清新","日系","乾淨"]',
  },
  campaigns: [{
    id: "campaign-1",
    name: "新品上市",
    goals: '["新品上市","導購轉換"]',
    description: "主打敏感肌適用的新款除毛刀",
    importantDates: [{ date: new Date("2026-09-10T00:00:00.000Z"), label: "新品首賣" }],
    products: [{ id: "product-1", label: "敏感肌女用除毛刀", imageUrl: "/uploads/razor.png" }],
  }],
};

test("buildPlannerContext gives strategy and topics grounded brand and product facts", () => {
  const context = buildPlannerContext(input, new Map([["product-1", "女性用除毛刀，具防刮護膚設計"]]));

  assert.deepEqual(context.brand, {
    name: "舒適牌女刀",
    description: "為女性設計的除毛與肌膚護理品牌",
    industry: "個人護理",
    toneLabels: ["清新", "日系", "乾淨"],
  });
  assert.deepEqual(context.campaigns[0], {
    id: "campaign-1",
    name: "新品上市",
    goals: ["新品上市", "導購轉換"],
    description: "主打敏感肌適用的新款除毛刀",
    importantDates: [{ date: "2026-09-10", label: "新品首賣" }],
    products: [{ id: "product-1", label: "敏感肌女用除毛刀", imageAnalysis: "女性用除毛刀，具防刮護膚設計" }],
  });
  assert.match(context.groundingRules, /不得僅從品牌名稱猜測產品類別/);
  assert.match(context.groundingRules, /不得創造未提供的產品/);
  assert.match(context.groundingRules, /資訊不足時.*通用品牌或互動內容/);
});

test("groundStrategyWithoutProducts moves product allocation to engagement when no product is linked", () => {
  const strategy = {
    summary: "test",
    contentMix: [
      { type: "BRAND", count: 2, reason: "brand" },
      { type: "PRODUCT", count: 3, reason: "product" },
      { type: "ENGAGEMENT", count: 1, reason: "engagement" },
    ],
    campaignAllocations: [],
  };

  assert.deepEqual(groundStrategyWithoutProducts(strategy, false).contentMix, [
    { type: "BRAND", count: 2, reason: "brand" },
    { type: "PRODUCT", count: 0, reason: "尚未提供可依據的產品資料" },
    { type: "ENGAGEMENT", count: 4, reason: "engagement" },
  ]);
  assert.deepEqual(groundStrategyWithoutProducts(strategy, true), strategy);
});

test("hasUngroundedProductClaim catches unsupported product assertions but allows generic brand topics", () => {
  assert.equal(hasUngroundedProductClaim({ contentType: "PRODUCT", topic: "當季推薦", contentDirection: "" }), true);
  assert.equal(hasUngroundedProductClaim({ contentType: "EDUCATION", topic: "產品背後的環保理念", contentDirection: "介紹環保材質" }), true);
  assert.equal(hasUngroundedProductClaim({ contentType: "BRAND", topic: "品牌創立初心", contentDirection: "分享品牌故事與價值觀" }), false);
  assert.equal(hasUngroundedProductClaim({ contentType: "ENGAGEMENT", topic: "你心中的理想日常", contentDirection: "邀請粉絲留言分享" }), false);
});

test("no-product fallback templates contain no unsupported product claims", () => {
  for (const [contentType, topics] of Object.entries(NO_PRODUCT_TOPIC_TEMPLATES)) {
    for (const topic of topics) {
      assert.equal(hasUngroundedProductClaim({ contentType, topic, contentDirection: "" }), false, topic);
    }
  }
});

test("buildPlannerContext keeps products grounded when image analysis is unavailable", () => {
  const context = buildPlannerContext(input);

  assert.deepEqual(context.campaigns[0]?.products, [{
    id: "product-1",
    label: "敏感肌女用除毛刀",
    imageAnalysis: "",
  }]);
});

test("hasUsableCampaignProducts warns only when every campaign has no linked product", () => {
  assert.equal(hasUsableCampaignProducts(input.campaigns), true);
  assert.equal(hasUsableCampaignProducts(input.campaigns.map((campaign) => ({ ...campaign, products: [] }))), false);
});

test("productsNeedingImageAnalysis selects image-only products without re-analyzing descriptive labels", () => {
  const campaigns = [{
    ...input.campaigns[0],
    products: [
      { id: "generic", label: "產品 1", imageUrl: "/uploads/one.png" },
      { id: "described", label: "敏感肌女用除毛刀", imageUrl: "/uploads/two.png" },
      { id: "missing", label: "產品 2", imageUrl: "" },
    ],
  }];

  assert.deepEqual(productsNeedingImageAnalysis(campaigns), [
    { id: "generic", imageUrl: "/uploads/one.png" },
  ]);
});
