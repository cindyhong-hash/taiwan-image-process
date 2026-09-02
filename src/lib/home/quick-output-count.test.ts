import assert from "node:assert/strict";
import test from "node:test";

import { formatQuickSettingsLabel, normalizeQuickOutputCount, selectQuickVariants } from "./quick-output-count.ts";

test("normalizeQuickOutputCount accepts only one to three candidate images", () => {
  assert.equal(normalizeQuickOutputCount(1), 1);
  assert.equal(normalizeQuickOutputCount("2"), 2);
  assert.equal(normalizeQuickOutputCount(3), 3);
  assert.equal(normalizeQuickOutputCount(0), 3);
  assert.equal(normalizeQuickOutputCount(4), 3);
  assert.equal(normalizeQuickOutputCount(undefined), 3);
});

test("selectQuickVariants limits generation to the requested candidate count", () => {
  const variants = ["A", "B", "C"];
  assert.deepEqual(selectQuickVariants(variants, 1), ["A"]);
  assert.deepEqual(selectQuickVariants(variants, 2), ["A", "B"]);
  assert.deepEqual(selectQuickVariants(variants, 3), ["A", "B", "C"]);
});

test("formatQuickSettingsLabel summarizes the selected ratio and candidate count", () => {
  assert.equal(formatQuickSettingsLabel("4:5", 2), "4:5 · 2 張");
  assert.equal(formatQuickSettingsLabel("16:9", 3), "16:9 · 3 張");
});
