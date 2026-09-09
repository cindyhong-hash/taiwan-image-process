import { test } from "node:test";
import assert from "node:assert/strict";
import { brandCompleteness } from "./brandCompleteness.ts";

test("全部沒填 → 0%，missing 列出全部七項", () => {
  const r = brandCompleteness({ assetCount: 0 });
  assert.equal(r.percent, 0);
  assert.deepEqual(r.missing, ["品牌簡介", "品牌主色", "品牌語氣", "禁忌詞", "Logo", "過往貼文參考", "素材庫圖片"]);
});

test("全部填好 → 100%，missing 為空", () => {
  const r = brandCompleteness({
    description: "專注女性除毛與肌膚保養",
    primaryColor: "#ffeb85",
    toneLabels: ["清新"],
    taboos: ["不可出現競品名稱"],
    logoUrls: ["a.png"],
    pastPostUrls: ["b.png"],
    assetCount: 19,
  });
  assert.equal(r.percent, 100);
  assert.deepEqual(r.missing, []);
});

test("品牌簡介有被納入計算（原本漏算，導致空著也能拿高分）", () => {
  const base = { primaryColor: "#fff", toneLabels: ["清新"], taboos: ["x"], logoUrls: ["a"], pastPostUrls: ["b"], assetCount: 5 };
  const without = brandCompleteness({ ...base });
  const withDesc = brandCompleteness({ ...base, description: "品牌定位一句話" });
  assert.ok(withDesc.percent > without.percent, "填了簡介分數要上升");
  assert.ok(without.missing.includes("品牌簡介"));
  assert.ok(!withDesc.missing.includes("品牌簡介"));
});

test("只有空白字元的簡介不算填", () => {
  const r = brandCompleteness({ description: "   \n ", assetCount: 0 });
  assert.ok(r.missing.includes("品牌簡介"));
});

test("assetCount 原樣回傳，供畫面顯示張數", () => {
  assert.equal(brandCompleteness({ assetCount: 19 }).assetCount, 19);
});
