import assert from "node:assert/strict";
import test from "node:test";
import { layoutText, fitText, readTextLayout } from "./editable-text.ts";
const measure = (s: string) => [...new Intl.Segmenter().segment(s)].length * 10;
test("wraps Chinese, preserves explicit empty lines and graphemes", () => {
  assert.deepEqual(layoutText("溫和保養", 20, measure).map(l => l.text), ["溫和", "保養"]);
  assert.deepEqual(layoutText("A\n\nB", 100, measure).map(l => l.text), ["A", "", "B"]);
  assert.deepEqual(layoutText("👨‍👩‍👧‍👦好", 10, measure).map(l => l.text), ["👨‍👩‍👧‍👦", "好"]);
});
test("prefers word boundaries and can split oversized words without dropping characters", () => {
  const text = "Good skin 每一天";
  const lines = layoutText(text, 60, measure);
  assert.equal(lines.map(l => l.text).join(""), text);
  assert.equal(lines[0].text, "Good ");
  assert.equal(layoutText("abcdefghij", 20, measure).length, 5);
  assert.equal(layoutText("", 100, measure).length, 0);
  assert.throws(() => layoutText("abc", 0, measure));
});
test("fits full copy or explicitly reports overflow, without silently truncating", () => {
  const fitted = fitText("每天保養好心情", 150, 120, 20, 50);
  assert.ok(fitted.fits);
  assert.equal(fitted.lines.map(l => l.text).join(""), "每天保養好心情");
  assert.equal(fitText("長".repeat(500), 100, 40, 20, 50).fits, false);
});
test("legacy and malformed layout flags do not opt into new rendering", () => {
  assert.equal(readTextLayout(undefined), undefined);
  assert.equal(readTextLayout({ version: 1, wrap: "word", lineHeight: -1, letterSpacing: 0 }), undefined);
  assert.deepEqual(readTextLayout({ version: 1, wrap: "word", lineHeight: 1.25, letterSpacing: 0 }), { version: 1, wrap: "word", lineHeight: 1.25, letterSpacing: 0 });
});
