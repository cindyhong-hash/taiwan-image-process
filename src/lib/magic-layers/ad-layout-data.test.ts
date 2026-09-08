import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { prepareAdBackground, resolveTextTreatment } from "./ad-layout-data.ts";

test("chooses readable text over light and dark backgrounds without forcing a low-contrast brand color", () => {
  assert.deepEqual(resolveTextTreatment("#f7f8fb", "#f0c000"), { textColor: "#241f47", accentColor: "#f0c000" });
  assert.deepEqual(resolveTextTreatment("#102030", "#f0c000"), { textColor: "#ffffff", accentColor: "#f0c000" });
});

test("prepares a full-bleed opaque background for the requested canvas ratio", async () => {
  const wide = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "#98c5dd" } }).png().toBuffer();
  const output = await prepareAdBackground(wide, 1024, 1280);
  const metadata = await sharp(output).metadata();
  const corner = await sharp(output).extract({ left: 0, top: 0, width: 1, height: 1 }).ensureAlpha().raw().toBuffer();

  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1280);
  assert.equal(corner[3], 255);
});
