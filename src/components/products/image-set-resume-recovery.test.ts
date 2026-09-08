import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("incomplete resume recovery offers a discard-and-restart path", async () => {
  const source = await readFile(new URL("./ImageSetModal.tsx", import.meta.url), "utf8");

  assert.match(source, /丟棄這批重新開始/);
  assert.match(source, /clearSavedImageSetBatch\(window\.localStorage, productId\)/);
  assert.match(source, /setResumeRecovery\(null\)/);
  assert.match(source, /void loadInitial\(\)/);
});
