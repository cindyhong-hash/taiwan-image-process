import assert from "node:assert/strict";
import test from "node:test";

import { assignInitialSchedule, calendarDays, dateKey } from "./calendar.ts";

test("assignInitialSchedule spreads unscheduled items across the month and preserves existing dates", () => {
  const result = assignInitialSchedule(
    [
      { id: "fixed", scheduledDate: "2026-09-08T12:00:00.000Z" },
      { id: "a", scheduledDate: null },
      { id: "b", scheduledDate: null },
      { id: "c", scheduledDate: null },
    ],
    2026,
    9,
  );

  assert.deepEqual(result, [
    { id: "fixed", scheduledDate: "2026-09-08T12:00:00.000Z" },
    { id: "a", scheduledDate: "2026-09-01" },
    { id: "b", scheduledDate: "2026-09-15" },
    { id: "c", scheduledDate: "2026-09-30" },
  ]);
});

test("assignInitialSchedule returns an empty list when there are no items", () => {
  assert.deepEqual(assignInitialSchedule([], 2026, 9), []);
});

test("calendarDays includes leading blanks and every date in the month", () => {
  const days = calendarDays(2026, 9);
  assert.deepEqual(days.slice(0, 4), [null, null, 1, 2]);
  assert.equal(days.at(-1), 30);
});

test("dateKey normalizes valid dates and rejects invalid values", () => {
  assert.equal(dateKey("2026-09-08T12:00:00.000Z"), "2026-09-08");
  assert.equal(dateKey(null), null);
  assert.equal(dateKey("not-a-date"), null);
});
