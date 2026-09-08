import assert from "node:assert/strict";
import test from "node:test";
import { imageSetCompleteness } from "./productMeta.ts";

test("new composable asset packs report all five required roles", () => {
  assert.deepEqual(
    imageSetCompleteness(new Set(["hero", "detail", "background", "benefit", "decoration"])),
    { doneCount: 5, missingRoles: [] },
  );
});

test("legacy lifestyle and texture/ingredient packs remain complete", () => {
  assert.deepEqual(
    imageSetCompleteness(new Set(["hero", "detail", "lifestyle", "background", "decoration"])),
    { doneCount: 5, missingRoles: [] },
  );
  assert.deepEqual(
    imageSetCompleteness(new Set(["hero", "texture", "ingredient", "background", "decoration"])),
    { doneCount: 5, missingRoles: [] },
  );
});
