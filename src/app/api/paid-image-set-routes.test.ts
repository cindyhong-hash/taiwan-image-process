import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const paidRouteFiles = [
  new URL("./products/[productId]/image-set/analyze/route.ts", import.meta.url),
  new URL("./products/[productId]/image-set/route.ts", import.meta.url),
  new URL("./library/images/[id]/regenerate/route.ts", import.meta.url),
];

test("every paid image-set POST is constructed through the shared fail-closed route guard", async () => {
  for (const routeFile of paidRouteFiles) {
    const source = await readFile(routeFile, "utf8");
    assert.match(source, /import \{ protectPaidRoute \} from "@\/lib\/site-gate";/);
    assert.match(source, /export const POST = protectPaidRoute\(/);
    assert.doesNotMatch(source, /export async function POST/);
  }
});

test("paid routes receive their absolute-deadline origin from the guard invocation", async () => {
  for (const routeFile of paidRouteFiles) {
    const source = await readFile(routeFile, "utf8");
    assert.match(source, /\{ invocationStartedAt \}/);
    assert.match(source, /createImageSetExecution\(invocationStartedAt,/);
  }
});
