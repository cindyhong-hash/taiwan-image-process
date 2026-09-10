import assert from "node:assert/strict";
import test from "node:test";
import { savedToLayerData, type SavedLayer } from "./saved-layer.ts";
const saved: SavedLayer = { id: "text", name: "文案", type: "independent_text", zIndex: 2, x: 20, y: 30, w: 300, h: 200, rotation: 0, visible: true, locked: false, opacity: 1, isText: true, text: "每天\n更美好", fontSize: 32, align: "left" };
test("restores multiline settings and leaves legacy text unflagged", () => {
  assert.equal((savedToLayerData(saved).meta.style as Record<string, unknown>).layout, undefined);
  const textLayout = { version: 1 as const, wrap: "word" as const, lineHeight: 1.3, letterSpacing: 1 };
  const layer = savedToLayerData({ ...saved, textLayout });
  assert.deepEqual((layer.meta.style as Record<string, unknown>).layout, textLayout);
  assert.equal((layer.meta.style as Record<string, unknown>).text, saved.text);
  assert.equal(layer.width, 300);
});
