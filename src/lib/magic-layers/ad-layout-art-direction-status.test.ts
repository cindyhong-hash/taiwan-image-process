import assert from "node:assert/strict";
import test from "node:test";
import { artDirectionStatus } from "./ad-layout-art-direction-status.ts";
import type { ArtDirectionResult } from "./ad-layout-art-direction.ts";

test("only reports vision when a trusted decision changed a candidate", () => {
  const result: ArtDirectionResult = { source: "vision", decision: { version: 1, directions: [] } };
  assert.deepEqual(artDirectionStatus(result, [{}]), {
    source: "fallback",
    message: "已使用穩定排版規則。",
  });
  assert.deepEqual(artDirectionStatus(result, [{ designDecision: { version: 1, source: "vision" } }]), {
    source: "vision",
    message: "已依商品素材調整視覺方向。",
  });
});

test("uses a safe fallback message without provider details", () => {
  const result: ArtDirectionResult = { source: "fallback", decision: null, reason: "timeout" };
  assert.deepEqual(artDirectionStatus(result, []), {
    source: "fallback",
    message: "視覺方向暫時不可用，已使用穩定排版規則。",
  });
});
