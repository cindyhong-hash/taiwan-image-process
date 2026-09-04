import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeImageSetProduct,
  createAndScheduleImageSetBatch,
  prepareImageSetRegenerationFromRow,
  requestImageSetRegeneration,
  readImageSetProduct,
  runImageSetBatch,
  type ImageSetBatchInput,
  type ImageSetBatchDependencies,
} from "./image-set-orchestrator.ts";
import type { ProductVisualProfile } from "./product-visual-profile.ts";
import type { ImageSetArtDirection } from "./product-visual-analysis.ts";
import type { ImageSetRoleSpec } from "./image-set-roles.ts";

const profile: ProductVisualProfile = {
  version: 1,
  productType: "美體除毛刀",
  productArchetype: "beauty_device",
  confidence: 0.9,
  appearance: { shape: "筆型", materials: ["金屬"], colors: ["白", "冰藍"], distinctiveDetails: ["圓形刀頭"], visibleTextOrLogos: [] },
  useCases: ["日常修整"],
  suitableScenes: ["明亮浴室"],
  visualMotifs: [],
  prohibitedChanges: [],
  sourceImageCount: 2,
};

const artDirection: ImageSetArtDirection = {
  concept: "一致的美容個護攝影",
  palette: { dominant: ["白", "冰藍"], accent: [] },
  lighting: "柔和光線",
  materials: ["金屬"],
  backgroundLanguage: "明亮浴室",
  cameraLanguage: "清晰攝影",
  consistencyRules: [],
};

const roles: ImageSetRoleSpec[] = [
  { role: "hero", label: "主視覺", path: "edit", cutout: false, sceneCn: "主視覺", objective: "hero", composition: "hero", mustNotShow: [] },
  { role: "detail", label: "細節", path: "edit", cutout: false, sceneCn: "細節", objective: "detail", composition: "detail", mustNotShow: [] },
  { role: "lifestyle", label: "情境", path: "edit", cutout: false, sceneCn: "情境", objective: "lifestyle", composition: "lifestyle", mustNotShow: [] },
  { role: "background", label: "背景", path: "text", cutout: false, sceneCn: "背景", objective: "background", composition: "background", mustNotShow: [] },
  { role: "decoration", label: "裝飾", path: "text", cutout: true, sceneCn: "裝飾", objective: "decoration", composition: "decoration", mustNotShow: [] },
];

function input(): ImageSetBatchInput {
  return {
    batchId: "batch-1",
    sourceHash: "source-hash",
    profile,
    artDirection,
    product: {
      id: "product-1",
      clientId: "client-1",
      name: "美體除毛刀",
      category: "美容個護",
      description: null,
      primaryColorOverride: null,
      rawImageUrls: ["/raw-a.png"],
      heroImageUrl: "/hero.png",
    },
    rows: roles.map((role) => ({ id: `row-${role.role}`, role })),
  };
}

function fakeDeps(options: { events?: string[]; failRole?: string } = {}): ImageSetBatchDependencies {
  const events = options.events ?? [];
  return {
    updateRow: async (_id, data) => { if (data.status) events.push(`${_id.replace("row-", "")}:${data.status.toLowerCase()}`); },
    generateRole: async ({ role, batchHeroImageUrl }) => {
      events.push(`${role}:start${batchHeroImageUrl ? ":anchored" : ""}`);
      if (options.failRole === role) throw new Error(`${role} failed`);
      return { buffer: Buffer.from(role), contentType: "image/png", provider: `provider:${role}` };
    },
    saveBuffer: async (_buffer, _extension, prefix) => {
      const role = prefix.replace("product-set-", "").replace("-", "");
      events.push(`${role}:saved`);
      return `/uploads/${prefix}.png`;
    },
    loadAsDataUri: async (url) => `data:image/png;base64,${Buffer.from(url).toString("base64")}`,
  };
}

test("starts hero before dependent roles and uses its saved URL as their style anchor", async () => {
  const events: string[] = [];
  await runImageSetBatch(input(), fakeDeps({ events }));
  assert.ok(events.indexOf("hero:start") < events.findIndex((event) => event.startsWith("detail:start")));
  assert.ok(events.indexOf("hero:done") < events.findIndex((event) => event.startsWith("lifestyle:start")));
  assert.ok(events.includes("detail:start:anchored"));
  assert.ok(events.includes("lifestyle:start:anchored"));
});

test("continues the remaining roles when hero fails", async () => {
  const result = await runImageSetBatch(input(), fakeDeps({ failRole: "hero" }));
  assert.equal(result.statuses.hero, "FAILED");
  assert.equal(result.statuses.background, "DONE");
  assert.equal(result.statuses.decoration, "DONE");
});

test("persists provider and shared art direction for retry", async () => {
  const updates: Array<{ id: string; paramsJson?: string }> = [];
  const result = await runImageSetBatch(input(), {
    ...fakeDeps(),
    updateRow: async (id, data) => { updates.push({ id, paramsJson: data.paramsJson }); },
  });
  const heroParams = result.params.hero;
  assert.ok(heroParams);
  assert.equal(heroParams.profileVersion, 1);
  assert.equal(heroParams.artDirection.concept, artDirection.concept);
  assert.equal(heroParams.provider, "provider:hero");
  const saved = updates
    .filter((update) => update.id === "row-hero" && update.paramsJson)
    .map((update) => JSON.parse(update.paramsJson!))
    .find((params) => params.provider);
  assert.deepEqual(Object.keys(saved).sort(), ["artDirection", "imageSet", "profileVersion", "provider", "roleSpec", "sourceHash"].sort());
  assert.equal(saved.provider, "provider:hero");
});

test("does not mark a generated row DONE without a concrete provider trace", async () => {
  const batch = input();
  batch.rows = [batch.rows[0]];
  const result = await runImageSetBatch(batch, {
    ...fakeDeps(),
    generateRole: async () => ({ buffer: Buffer.from("hero"), contentType: "image/png", provider: "" }),
  });
  assert.equal(result.statuses.hero, "FAILED");
  assert.equal(result.params.hero?.provider, undefined);
});

test("keeps the product hero within the five identity references", async () => {
  const batch = input();
  batch.product.rawImageUrls = ["/raw-1.png", "/raw-2.png", "/raw-3.png", "/raw-4.png", "/raw-5.png", "/raw-6.png"];
  let heroReference: string | undefined;
  await runImageSetBatch(batch, {
    ...fakeDeps(),
    generateRole: async (request) => {
      if (request.role === "hero") heroReference = request.heroImageUrl ?? undefined;
      return { buffer: Buffer.from(request.role), contentType: "image/png", provider: "test" };
    },
  });
  assert.equal(heroReference, `data:image/png;base64,${Buffer.from("/hero.png").toString("base64")}`);
});

test("does not reject the whole batch when one row lifecycle write fails", async () => {
  const updates: string[] = [];
  const result = await runImageSetBatch(input(), {
    ...fakeDeps(),
    updateRow: async (id, data) => {
      updates.push(`${id}:${data.status}`);
      if (id === "row-hero" && data.status === "GENERATING") throw new Error("database unavailable");
    },
  });
  assert.equal(result.statuses.hero, "FAILED");
  assert.equal(result.statuses.background, "DONE");
  assert.ok(updates.includes("row-hero:FAILED"));
});

test("keeps sibling roles running when a non-hero role fails", async () => {
  const result = await runImageSetBatch(input(), fakeDeps({ failRole: "detail" }));
  assert.equal(result.statuses.detail, "FAILED");
  assert.equal(result.statuses.lifestyle, "DONE");
  assert.equal(result.statuses.background, "DONE");
  assert.equal(result.statuses.decoration, "DONE");
});

function storedProduct() {
  return {
    ...input().product,
    rawImageUrls: JSON.stringify(input().product.rawImageUrls),
    visualProfileJson: JSON.stringify(profile),
    visualProfileSourceHash: "",
  };
}

test("GET view is read-only and reports a valid cached profile without model calls or writes", async () => {
  const product = storedProduct();
  const expectedHash = (await import("./product-visual-profile.ts")).computeProductVisualSourceHash({
    ...product,
    rawImageUrls: JSON.parse(product.rawImageUrls),
  });
  product.visualProfileSourceHash = expectedHash;
  let analyzed = 0;
  let writes = 0;
  const response = await readImageSetProduct(product, null, {
    analyze: async () => { analyzed += 1; return profile; },
    persistProfile: async () => { writes += 1; },
  });
  assert.equal(response.needsAnalysis, false);
  assert.equal(response.hasHero, true);
  assert.equal(response.profile?.productType, profile.productType);
  assert.equal(response.suggestions.length, 5);
  assert.equal(analyzed, 0);
  assert.equal(writes, 0);
});

test("GET stale view remains read-only and exposes safe fallback suggestions", async () => {
  const product = storedProduct();
  product.visualProfileSourceHash = "stale-hash";
  const response = await readImageSetProduct(product, null, {
    analyze: async () => { throw new Error("GET must not call a model"); },
    persistProfile: async () => { throw new Error("GET must not write"); },
  });
  assert.equal(response.profile, null);
  assert.equal(response.needsAnalysis, true);
  assert.equal(response.suggestions.length, 5);
});

test("analyze returns cache unless forced, and force persists the current source hash", async () => {
  const product = storedProduct();
  const expectedHash = (await import("./product-visual-profile.ts")).computeProductVisualSourceHash({
    ...product,
    rawImageUrls: JSON.parse(product.rawImageUrls),
  });
  product.visualProfileSourceHash = expectedHash;
  let analyzes = 0;
  const writes: Array<{ visualProfileJson: string; visualProfileSourceHash: string }> = [];
  const deps = {
    analyze: async () => { analyzes += 1; return { ...profile, productType: "重新分析後" }; },
    persistProfile: async (_id: string, data: { visualProfileJson: string; visualProfileSourceHash: string }) => { writes.push(data); },
  };

  const cached = await analyzeImageSetProduct(product, null, false, deps);
  assert.equal(cached.cached, true);
  assert.equal(analyzes, 0);
  assert.equal(writes.length, 0);

  const forced = await analyzeImageSetProduct(product, null, true, deps);
  assert.equal(forced.cached, false);
  assert.equal(forced.profile.productType, "重新分析後");
  assert.equal(analyzes, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].visualProfileSourceHash, expectedHash);
  assert.equal(JSON.parse(writes[0].visualProfileJson).productType, "重新分析後");
});

test("POST creates every selected row as PENDING in one batch and schedules exactly one callback", async () => {
  const product = storedProduct();
  const expectedHash = (await import("./product-visual-profile.ts")).computeProductVisualSourceHash({
    ...product,
    rawImageUrls: JSON.parse(product.rawImageUrls),
  });
  product.visualProfileSourceHash = expectedHash;
  const creates: Array<Record<string, unknown>> = [];
  const callbacks: Array<() => Promise<unknown>> = [];
  let batchRuns = 0;
  const response = await createAndScheduleImageSetBatch({
    product,
    client: null,
    selectedRoles: ["hero", "background", "decoration"],
    requestSourceHash: expectedHash,
  }, {
    createRows: async (rows) => rows.map((row, index) => {
      creates.push(row);
      return { id: `created-${index}` };
    }),
    scheduleAfter: (callback) => { callbacks.push(callback); },
    runBatch: async () => { batchRuns += 1; return { statuses: {}, params: {} }; },
    createBatchId: () => "batch-fixed",
  });

  assert.equal(response.ok, true);
  if (!response.ok) return;
  assert.equal(response.batchId, "batch-fixed");
  assert.equal(response.items.length, 3);
  assert.equal(creates.length, 3);
  assert.deepEqual(new Set(creates.map((row) => row.batchId)), new Set(["batch-fixed"]));
  assert.ok(creates.every((row) => row.status === "PENDING"));
  assert.equal(callbacks.length, 1);
  assert.equal(batchRuns, 0, "the request must return before background generation starts");
  await callbacks[0]();
  assert.equal(batchRuns, 1);
});

test("stale retry returns 409 Traditional Chinese guidance and mutates no row", async () => {
  let updates = 0;
  let schedules = 0;
  const response = await requestImageSetRegeneration("row-stale", {
    prepare: async () => ({ ok: false as const, status: 409 as const, error: "商品資料已更新，請先重新分析產品後再重新產生這張素材。" }),
    updateRow: async () => { updates += 1; },
    scheduleAfter: () => { schedules += 1; },
    regenerate: async () => ({ statuses: {}, params: {} }),
  });
  assert.deepEqual(response, { ok: false, status: 409, error: "商品資料已更新，請先重新分析產品後再重新產生這張素材。" });
  assert.match(response.error, /請先重新分析產品/);
  assert.equal(updates, 0);
  assert.equal(schedules, 0);
});

test("retry preparation rejects a stale source hash and otherwise preserves the saved role spec", async () => {
  const product = storedProduct();
  const sourceHash = (await import("./product-visual-profile.ts")).computeProductVisualSourceHash({
    ...product,
    rawImageUrls: JSON.parse(product.rawImageUrls),
  });
  product.visualProfileSourceHash = sourceHash;
  const savedRole = { ...roles[1], sceneCn: "使用者確認過的專屬細節構圖" };
  const row = {
    id: "row-detail",
    batchId: "batch-existing",
    paramsJson: JSON.stringify({
      imageSet: true,
      profileVersion: 1,
      sourceHash,
      artDirection,
      roleSpec: savedRole,
      provider: "openrouter:gpt-image-1",
    }),
    product,
  };

  const prepared = prepareImageSetRegenerationFromRow(row);
  assert.equal(prepared.ok, true);
  if (prepared.ok) assert.equal(prepared.value.input.rows[0].role.sceneCn, "使用者確認過的專屬細節構圖");

  const stale = prepareImageSetRegenerationFromRow({
    ...row,
    product: { ...product, description: "changed after generation" },
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.equal(stale.status, 409);
    assert.match(stale.error, /請先重新分析產品/);
  }
});

test("retry marks and regenerates only the requested row", async () => {
  const updates: string[] = [];
  const callbacks: Array<() => Promise<unknown>> = [];
  const prepared = { rowId: "row-target", input: { ...input(), rows: [{ id: "row-target", role: roles[1] }] } };
  const response = await requestImageSetRegeneration("row-target", {
    prepare: async () => ({ ok: true as const, value: prepared }),
    updateRow: async (id) => { updates.push(id); },
    scheduleAfter: (callback) => { callbacks.push(callback); },
    regenerate: async (id, value) => {
      assert.equal(id, "row-target");
      assert.equal(value.rowId, "row-target");
      return { statuses: { detail: "DONE" }, params: {} };
    },
  });
  assert.deepEqual(response, { ok: true, id: "row-target", status: "GENERATING" });
  assert.deepEqual(updates, ["row-target"]);
  assert.equal(callbacks.length, 1);
  await callbacks[0]();
  assert.deepEqual(updates, ["row-target"]);
});
