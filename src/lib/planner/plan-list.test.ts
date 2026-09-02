import assert from "node:assert/strict";
import test from "node:test";

import { getPlanProgress, getPlanStatusGroup } from "./plan-list.ts";

test("getPlanProgress keeps every planning stage ordered from draft to completion", () => {
  assert.equal(getPlanProgress("DRAFT"), 10);
  assert.equal(getPlanProgress("STRATEGY_READY"), 35);
  assert.equal(getPlanProgress("TOPICS_READY"), 60);
  assert.equal(getPlanProgress("CALENDAR_READY"), 75);
  assert.equal(getPlanProgress("GENERATION_READY"), 85);
  assert.equal(getPlanProgress("REVIEW"), 95);
  assert.equal(getPlanProgress("COMPLETED"), 100);
});

test("getPlanProgress gives unknown persisted states a safe starting progress", () => {
  assert.equal(getPlanProgress("LEGACY_STATE"), 10);
});

test("getPlanStatusGroup separates completed plans from active work", () => {
  assert.equal(getPlanStatusGroup("COMPLETED"), "completed");
  assert.equal(getPlanStatusGroup("DRAFT"), "active");
  assert.equal(getPlanStatusGroup("REVIEW"), "active");
});
