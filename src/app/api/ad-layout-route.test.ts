import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ad layout loads completed product assets newest first", async () => {
  const source = await readFile(new URL("./magic-layers/ad-layout/route.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /assets:\s*\{\s*where:\s*\{\s*status:\s*"DONE"\s*\},\s*orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}/,
  );
});

test("ad layout assesses the same target canvas used to prepare the background", async () => {
  const source = await readFile(new URL("./magic-layers/ad-layout/route.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /assessAdLayoutVisualKit\(context,\s*\{\s*backgroundCanvas:\s*\{\s*width:\s*W,\s*height:\s*H\s*\},?\s*\}\)/,
  );
});
