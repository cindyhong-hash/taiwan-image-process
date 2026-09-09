import { test } from "node:test";
import assert from "node:assert/strict";
import { pickReuseOpportunities, classifyKind, similarity, type ReuseActivity } from "./reuse-picker.ts";

/** 基準「今天」：2026-09-09（台北）。 */
const NOW = new Date("2026-09-09T04:00:00Z");

const act = (over: Partial<ReuseActivity> & { id: string; theme: string; createdAt: string }): ReuseActivity => ({
  status: "DONE",
  layoutId: "single",
  ...over,
});

test("太新的內容不列入（翻新沒有意義）", () => {
  const out = pickReuseOpportunities([act({ id: "a", theme: "夏日除毛技巧", createdAt: "2026-09-01" })], { now: NOW });
  assert.equal(out.length, 0);
});

test("去年同期做過的排在最前面，理由帶出年月", () => {
  const out = pickReuseOpportunities(
    [
      act({ id: "old-other", theme: "冬季乾燥護理指南", createdAt: "2025-01-10" }),
      act({ id: "same-period", theme: "入秋換季保養重點", createdAt: "2025-09-12" }),
    ],
    { now: NOW },
  );
  assert.equal(out[0].activity.id, "same-period");
  assert.match(out[0].reason ?? "", /去年同期（2025\/09）做過/);
});

test("主題撞上即將到來的節氣會加分", () => {
  const out = pickReuseOpportunities(
    [
      act({ id: "plain", theme: "品牌小故事分享", createdAt: "2026-03-01" }),
      act({ id: "seasonal", theme: "開學季的肌膚準備", createdAt: "2026-03-01" }),
    ],
    { now: NOW },
  );
  assert.equal(out[0].activity.id, "seasonal");
});

test("提到現在有在推的產品會加分", () => {
  const out = pickReuseOpportunities(
    [
      act({ id: "no-prod", theme: "肌膚保養的日常習慣", createdAt: "2026-02-01" }),
      act({ id: "with-prod", theme: "美體除毛刀的正確用法", createdAt: "2026-02-01" }),
    ],
    { now: NOW, productNames: ["美體除毛刀"] },
  );
  assert.equal(out[0].activity.id, "with-prod");
  assert.match(out[0].reason ?? "", /美體除毛刀/);
});

test("近 60 天做過類似主題 → 扣分後被擠掉", () => {
  const activities = [
    // 近期剛做過幾乎一樣的主題
    act({ id: "recent-dup", theme: "夏日除毛技巧大公開", createdAt: "2026-08-25" }),
    act({ id: "old-dup", theme: "夏日除毛技巧大公開！", createdAt: "2026-01-05" }),
    act({ id: "old-unique", theme: "品牌理念與永續包裝", createdAt: "2026-01-05" }),
  ];
  const out = pickReuseOpportunities(activities, { now: NOW });
  const ids = out.map((o) => o.activity.id);
  assert.ok(ids.indexOf("old-unique") < ids.indexOf("old-dup") || !ids.includes("old-dup"));
});

test("只挑 DONE，且排除自由排版設計稿", () => {
  const out = pickReuseOpportunities(
    [
      act({ id: "draft", theme: "還沒做完的主題", createdAt: "2026-01-01", status: "DRAFT" }),
      act({ id: "ml", theme: "自由排版設計稿", createdAt: "2026-01-01", layoutId: "magic-layers" }),
    ],
    { now: NOW },
  );
  assert.equal(out.length, 0);
});

test("內容類型分類：促銷／知識／互動／生活／產品", () => {
  assert.equal(classifyKind(act({ id: "1", theme: "限時優惠 88 折", createdAt: "2026-01-01" })), "promo");
  assert.equal(classifyKind(act({ id: "2", theme: "如何正確使用除毛刀", createdAt: "2026-01-01" })), "knowledge");
  assert.equal(classifyKind(act({ id: "3", theme: "你知道嗎？", createdAt: "2026-01-01" })), "engagement");
  assert.equal(classifyKind(act({ id: "4", theme: "上班日常的儀式", createdAt: "2026-01-01" })), "lifestyle");
  assert.equal(classifyKind(act({ id: "5", theme: "美體除毛刀新色上市", createdAt: "2026-01-01" })), "product");
});

test("相似度：幾乎一樣的主題高、無關的低", () => {
  assert.ok(similarity("夏日除毛技巧大公開", "夏日除毛技巧大公開！") > 0.8);
  assert.ok(similarity("夏日除毛技巧", "品牌永續包裝理念") < 0.2);
});

test("回傳數量受 limit 限制", () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    act({ id: `a${i}`, theme: `舊主題 ${i} 的內容分享`, createdAt: "2026-01-02" }),
  );
  assert.equal(pickReuseOpportunities(many, { now: NOW }).length, 3);
  assert.equal(pickReuseOpportunities(many, { now: NOW, limit: 5 }).length, 5);
});

test("同一個理由不會連續佔滿三格（多樣性）", () => {
  // 五篇都是「互動型」且都很舊 → 若不做多樣性處理，三則理由會一模一樣。
  const acts = [
    act({ id: "e1", theme: "你知道嗎？除毛的冷知識", createdAt: "2026-01-02" }),
    act({ id: "e2", theme: "你會選哪一種？留言告訴我", createdAt: "2026-01-03" }),
    act({ id: "e3", theme: "猜猜這是什麼？", createdAt: "2026-01-04" }),
    act({ id: "k1", theme: "如何挑選適合的除毛方式", createdAt: "2026-01-05" }),
    act({ id: "p1", theme: "美體除毛刀新色登場", createdAt: "2026-01-06" }),
  ];
  const out = pickReuseOpportunities(acts, { now: NOW, productNames: ["美體除毛刀"] });
  // 有具體理由的不該重複；沒有具體訊號的會留空（卡片改顯示日期）。
  const reasons = out.map((o) => o.reason).filter(Boolean) as string[];
  assert.equal(new Set(reasons).size, reasons.length, `具體理由應互不重複，實際：${reasons.join(" / ")}`);
  assert.ok(reasons.length >= 1, "至少要有一則講得出具體理由");
});
