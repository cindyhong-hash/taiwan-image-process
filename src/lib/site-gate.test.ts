import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizePaidRequest,
  createSiteGateToken,
  protectPaidRoute,
  verifySiteGateCookie,
} from "./site-gate.ts";

test("accepts only the derived HttpOnly site gate cookie", () => {
  const password = "correct horse battery staple";
  const token = createSiteGateToken(password);
  assert.equal(verifySiteGateCookie(`other=1; site_gate=${token}`, password), true);
  assert.equal(verifySiteGateCookie("site_gate=wrong", password), false);
  assert.equal(verifySiteGateCookie("other=1", password), false);
  assert.notEqual(token, password);
});

test("paid endpoints fail closed in production when SITE_PASSWORD is missing", () => {
  const result = authorizePaidRequest(new Request("https://example.test/api/paid"), {
    nodeEnv: "production",
    sitePassword: undefined,
  });
  assert.deepEqual(result, {
    ok: false,
    status: 503,
    error: "付費功能尚未完成安全設定。",
  });
});

test("paid endpoints reject invalid cookies and allow the valid single-admin cookie", () => {
  const password = "admin-only";
  const invalid = authorizePaidRequest(new Request("https://example.test/api/paid", {
    headers: { cookie: "site_gate=invalid" },
  }), { nodeEnv: "production", sitePassword: password });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.status, 401);

  const valid = authorizePaidRequest(new Request("https://example.test/api/paid", {
    headers: { cookie: `site_gate=${createSiteGateToken(password)}` },
  }), { nodeEnv: "production", sitePassword: password });
  assert.deepEqual(valid, { ok: true });
});

test("local development may run paid endpoints without a configured password", () => {
  assert.deepEqual(authorizePaidRequest(new Request("http://localhost/api/paid"), {
    nodeEnv: "development",
    sitePassword: undefined,
  }), { ok: true });
});

test("paid route wrapper rejects before invoking object lookup or paid scheduling", async () => {
  let handlerCalls = 0;
  const route = protectPaidRoute(async (_request, context: { params: Promise<{ id: string }> }, execution) => {
    handlerCalls += 1;
    return Response.json({ id: (await context.params).id, startedAt: execution.invocationStartedAt });
  }, {
    authorizationEnvironment: { nodeEnv: "production", sitePassword: "admin-only" },
    now: () => 1234,
  });

  const unauthorized = await route(new Request("https://example.test/api/paid"), {
    params: Promise.resolve({ id: "must-not-query" }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(handlerCalls, 0);

  const authorized = await route(new Request("https://example.test/api/paid", {
    headers: { cookie: `site_gate=${createSiteGateToken("admin-only")}` },
  }), { params: Promise.resolve({ id: "safe" }) });
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), { id: "safe", startedAt: 1234 });
  assert.equal(handlerCalls, 1);
});

test("paid route wrapper fails closed before its handler when production is misconfigured", async () => {
  let handlerCalls = 0;
  const route = protectPaidRoute(async () => {
    handlerCalls += 1;
    return new Response(null, { status: 204 });
  }, { authorizationEnvironment: { nodeEnv: "production", sitePassword: undefined } });

  const response = await route(new Request("https://example.test/api/paid"), undefined);
  assert.equal(response.status, 503);
  assert.equal(handlerCalls, 0);
});
