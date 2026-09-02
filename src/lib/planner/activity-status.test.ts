import assert from "node:assert/strict";
import test from "node:test";

import { plannerStatusForActivity } from "./activity-status.ts";

test("plannerStatusForActivity maps generation lifecycle into planner review states", () => {
  assert.equal(plannerStatusForActivity("DRAFT"), "DRAFT");
  assert.equal(plannerStatusForActivity("PENDING"), "GENERATING");
  assert.equal(plannerStatusForActivity("GENERATING"), "GENERATING");
  assert.equal(plannerStatusForActivity("DONE"), "NEEDS_REVIEW");
  assert.equal(plannerStatusForActivity("FAILED"), "DRAFT");
});

test("plannerStatusForActivity ignores unrelated activity states", () => {
  assert.equal(plannerStatusForActivity("ARCHIVED"), null);
  assert.equal(plannerStatusForActivity(""), null);
});
