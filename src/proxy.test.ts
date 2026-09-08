import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authorizePaidRequest, createSiteGateToken } from "./lib/site-gate.ts";

test("site gate uses POST-redirect-GET and the issued cookie allows the follow-up GET", async () => {
  const source = await readFile(new URL("./proxy.ts", import.meta.url), "utf8");
  assert.match(source, /request\.method === "POST"/);
  assert.match(source, /NextResponse\.redirect\(request\.url, 303\)/);
  assert.match(source, /res\.cookies\.set\(SITE_GATE_COOKIE_NAME/);

  // The GET after the 303 carries the cookie set by the successful POST.
  const password = "correct horse battery staple";
  const followUp = authorizePaidRequest(new Request("https://example.test/clients/demo", {
    headers: { cookie: `site_gate=${createSiteGateToken(password)}` },
  }), { nodeEnv: "production", sitePassword: password });
  assert.deepEqual(followUp, { ok: true });
});
