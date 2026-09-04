import assert from "node:assert/strict";
import test from "node:test";
import {
  imageSetBatchProgress,
  imageSetProgressLabel,
  isImageSetBatchSettled,
  mergeImageSetPollResult,
} from "./image-set-ui.ts";

test("reports analysis and batch progress in Traditional Chinese", () => {
  assert.equal(
    imageSetProgressLabel({ phase: "analyzing", sourceImageCount: 3 }),
    "正在讀取 3 張商品照，整理產品外觀與套圖方向…",
  );
  assert.equal(
    imageSetProgressLabel({ phase: "generating", completed: 2, total: 5, activeRoleLabel: "使用情境" }),
    "正在建立使用情境 · 完成 2/5",
  );
  assert.equal(
    imageSetProgressLabel({ phase: "analyzing", sourceImageCount: 0 }),
    "正在讀取商品照，整理產品外觀與套圖方向…",
  );
});

test("finishes when every role is done or failed", () => {
  assert.equal(isImageSetBatchSettled([{ status: "DONE" }, { status: "FAILED" }]), true);
  assert.equal(isImageSetBatchSettled([{ status: "DONE" }, { status: "GENERATING" }]), false);
  assert.equal(isImageSetBatchSettled([]), false);
});

test("reports completed count and the first active role", () => {
  assert.deepEqual(imageSetBatchProgress([
    { status: "DONE", label: "商品主視覺" },
    { status: "GENERATING", label: "功能細節" },
    { status: "PENDING", label: "使用情境" },
    { status: "FAILED", label: "情境空景" },
  ]), { completed: 2, total: 4, activeRoleLabel: "功能細節" });
});

test("poll timeout leaves the persisted role state unchanged", () => {
  const current: { id: string; status: "PENDING" | "GENERATING" | "DONE" | "FAILED"; label: string; imageUrl?: string } = {
    id: "row-1",
    status: "GENERATING",
    label: "商品主視覺",
  };
  assert.deepEqual(mergeImageSetPollResult(current, { kind: "timeout" }), current);
  assert.deepEqual(
    mergeImageSetPollResult(current, { kind: "row", row: { status: "DONE", imageUrl: "/hero.png" } }),
    { ...current, status: "DONE", imageUrl: "/hero.png" },
  );
});
