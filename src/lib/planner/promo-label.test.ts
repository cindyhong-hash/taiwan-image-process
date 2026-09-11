import assert from "node:assert/strict";
import test from "node:test";
import { promoWhenLabel, proximityScore } from "./trend-signals.ts";

// 使用者實測：9/9 的 99 購物節，到了 9/11 卡片還寫「就是今天」。
test("已經過去的檔期不能說成「就是今天」", () => {
  assert.equal(promoWhenLabel(-2), "剛過 2 天");
  assert.equal(promoWhenLabel(-1), "剛過 1 天");
  assert.equal(promoWhenLabel(-3), "剛過 3 天");
});

test("當天與未來的文案維持原樣", () => {
  assert.equal(promoWhenLabel(0), "就是今天");
  assert.equal(promoWhenLabel(1), "還有 1 天");
  assert.equal(promoWhenLabel(30), "還有 30 天");
});

test("過期檔期不該排在還沒到的檔期前面", () => {
  const past = proximityScore(-2)!;
  assert.ok(past < proximityScore(0)!, "不該跟今天同分");
  assert.ok(past < proximityScore(7)!, "不該贏過一週內的檔期");
  assert.ok(past < proximityScore(14)!, "不該贏過兩週內的檔期");
  assert.equal(proximityScore(-4), null, "超過 3 天仍要整個丟掉");
});
