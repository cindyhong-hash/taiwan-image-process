import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import {
  IMAGE_SET_BATCH_DEADLINE_MS,
  analyzeImageSetProduct,
  cleanupImageSetOrphanAsset,
  createAndScheduleImageSetBatch,
  createImageSetExecution,
  prepareImageSetRegenerationFromRow,
  reconcileImageSetCleanupJobs,
  reconcileStaleImageSetWork,
  requestImageSetAnalysis,
  requestImageSetRegeneration,
  readImageSetProduct,
  runImageSetBatch,
  type ImageSetBatchInput,
  type ImageSetBatchDependencies,
  type ImageSetOrphanCleanupJob,
  type StoredImageSetProduct,
} from "./image-set-orchestrator.ts";
import { ImageSetFallbackBudgetError } from "./image-set-model-router.ts";
import type { ProductVisualProfile } from "./product-visual-profile.ts";
import type { ImageSetArtDirection } from "./product-visual-analysis.ts";
import { planImageSetRoles, type ImageSetRoleSpec } from "./image-set-roles.ts";

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
  { role: "hero", label: "主視覺", usageDescription: "legacy", path: "edit", cutout: false, sceneCn: "主視覺", objective: "hero", composition: "hero", mustNotShow: [] },
  { role: "detail", label: "細節", usageDescription: "legacy", path: "edit", cutout: false, sceneCn: "細節", objective: "detail", composition: "detail", mustNotShow: [] },
  { role: "lifestyle", label: "情境", usageDescription: "legacy", path: "edit", cutout: false, sceneCn: "情境", objective: "lifestyle", composition: "lifestyle", mustNotShow: [] },
  { role: "background", label: "背景", usageDescription: "legacy", path: "text", cutout: false, sceneCn: "背景", objective: "background", composition: "background", mustNotShow: [] },
  { role: "decoration", label: "裝飾", usageDescription: "legacy", path: "text", cutout: true, sceneCn: "裝飾", objective: "decoration", composition: "decoration", mustNotShow: [] },
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
    logError: () => {},
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

test("new ad-asset roles load an original only for the cutout and keep text assets product-free", async () => {
  const batch = input();
  batch.rows = planImageSetRoles(profile).map((role) => ({ id: `ad-${role.role}`, role }));
  const requests: Array<{ role: string; path: string | undefined; hasProductReference: boolean }> = [];
  await runImageSetBatch(batch, {
    ...fakeDeps(),
    generateRole: async (request) => {
      requests.push({
        role: request.role,
        path: request.generationPath,
        hasProductReference: Boolean(request.heroImageUrl || request.rawImageUrls?.length),
      });
      return { buffer: Buffer.from(request.role), contentType: "image/png", provider: `provider:${request.role}` };
    },
  });

  assert.deepEqual(requests.find(({ role }) => role === "hero"), { role: "hero", path: "cutout", hasProductReference: true });
  for (const role of ["detail", "background", "benefit", "decoration"]) {
    assert.deepEqual(requests.find((request) => request.role === role), { role, path: "text", hasProductReference: false });
  }
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

test("rejects synthetic unreported provider traces", async () => {
  const batch = input();
  batch.rows = [batch.rows[0]];
  const result = await runImageSetBatch(batch, {
    ...fakeDeps(),
    generateRole: async () => ({ buffer: Buffer.from("hero"), contentType: "image/png", provider: "text:unreported" }),
  });
  assert.equal(result.statuses.hero, "FAILED");
});

test("logs complete provider errors but persists only a safe role-scoped Traditional Chinese message", async () => {
  const batch = input();
  batch.rows = [batch.rows[1]];
  const persisted: string[] = [];
  const logged: unknown[] = [];
  await runImageSetBatch(batch, {
    ...fakeDeps(),
    generateRole: async () => { throw new Error("fal secret upstream fragment 401"); },
    updateRow: async (_id, data) => { if (data.errorMessage) persisted.push(data.errorMessage); },
    logError: (...values) => { logged.push(values); },
  });
  assert.equal(logged.length, 1);
  assert.match(String(logged[0]), /fal secret upstream fragment 401/);
  assert.equal(persisted.length, 1);
  assert.match(persisted[0], /細節/);
  assert.doesNotMatch(persisted[0], /fal|401|upstream|secret/i);
});

test("persists a clear retry message when the router skips a fallback without enough batch time", async () => {
  const batch = input();
  batch.rows = [batch.rows[1]];
  const persisted: string[] = [];
  await runImageSetBatch(batch, {
    ...fakeDeps(),
    generateRole: async () => { throw new ImageSetFallbackBudgetError(); },
    updateRow: async (_id, data) => { if (data.errorMessage) persisted.push(data.errorMessage); },
  });
  assert.deepEqual(persisted, ["質地細節剩餘生成時間不足，未啟動下一個備援服務；可單獨重新產生。"]);
});

test("normalizes direct data URI references through the 1600px pipeline", async () => {
  const oversized = await sharp({
    create: { width: 2200, height: 1800, channels: 3, background: "#ffffff" },
  }).jpeg().toBuffer();
  const batch = input();
  batch.rows = [batch.rows[0]];
  batch.product.heroImageUrl = `data:image/jpeg;base64,${oversized.toString("base64")}`;
  batch.product.rawImageUrls = [];
  let normalized = "";
  await runImageSetBatch(batch, {
    updateRow: async () => {},
    generateRole: async (request) => {
      normalized = request.heroImageUrl ?? "";
      return { buffer: Buffer.from("hero"), contentType: "image/png", provider: "provider:hero" };
    },
    saveBuffer: async () => "/saved.png",
  });
  const decoded = Buffer.from(normalized.split(",")[1], "base64");
  const metadata = await sharp(decoded).metadata();
  assert.ok((metadata.width ?? 0) <= 1600);
  assert.ok((metadata.height ?? 0) <= 1600);
  assert.match(normalized, /^data:image\/png;base64,/);
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

test("retains successful product references when another reference fails to load", async () => {
  const batch = input();
  batch.rows = [batch.rows[0]];
  batch.product.rawImageUrls = ["/good.png", "/broken.png"];
  batch.product.heroImageUrl = null;
  let refs: string[] = [];
  const result = await runImageSetBatch(batch, {
    ...fakeDeps(),
    loadAsDataUri: async (url) => {
      if (url === "/broken.png") throw new Error("unavailable");
      return `data:image/png;base64,${Buffer.from(url).toString("base64")}`;
    },
    generateRole: async (request) => {
      refs = request.rawImageUrls ?? [];
      return { buffer: Buffer.from("hero"), contentType: "image/png", provider: "provider:hero" };
    },
  });
  assert.equal(result.statuses.hero, "DONE");
  assert.equal(refs.length, 1);
});

test("treats an unavailable optional batch hero anchor as non-fatal", async () => {
  const batch = input();
  batch.rows = [batch.rows[0], batch.rows[1]];
  let detailAnchor: string | null | undefined = "not-called";
  const result = await runImageSetBatch(batch, {
    ...fakeDeps(),
    loadAsDataUri: async (url) => {
      if (url.startsWith("/uploads/product-set-hero")) throw new Error("anchor unavailable");
      return `data:image/png;base64,${Buffer.from(url).toString("base64")}`;
    },
    generateRole: async (request) => {
      if (request.role === "detail") detailAnchor = request.batchHeroImageUrl;
      return { buffer: Buffer.from(request.role), contentType: "image/png", provider: `provider:${request.role}` };
    },
  });
  assert.equal(result.statuses.detail, "DONE");
  assert.equal(detailAnchor, undefined);
});

test("an abort while loading the optional hero anchor prevents the next paid generation", async () => {
  const controller = new AbortController();
  const generatedRoles: string[] = [];
  const batch = input();
  batch.rows = [batch.rows[0], batch.rows[1]];
  await runImageSetBatch(batch, {
    ...fakeDeps(),
    createAbortController: () => controller,
    setDeadlineTimer: () => 1,
    clearDeadlineTimer: () => {},
    now: () => 10_000,
    loadAsDataUri: async (url) => {
      if (url.startsWith("/uploads/product-set-hero-")) {
        controller.abort(new Error("deadline during hero anchor download"));
        throw controller.signal.reason;
      }
      return `data:image/png;base64,${Buffer.from(url).toString("base64")}`;
    },
    generateRole: async ({ role }) => {
      generatedRoles.push(role);
      return { buffer: Buffer.from(role), contentType: "image/png", provider: `provider:${role}` };
    },
  }, { leaseId: "abort-anchor", deadlineAt: 20_000 });
  assert.deepEqual(generatedRoles, ["hero"]);
});

test("deadline marks unfinished rows failed and late completion cannot overwrite them", async () => {
  assert.equal(IMAGE_SET_BATCH_DEADLINE_MS, 270_000);
  const batch = input();
  batch.rows = [batch.rows[0], batch.rows[1]];
  let release!: () => void;
  const generationGate = new Promise<void>((resolve) => { release = resolve; });
  let fireDeadline!: () => void;
  let currentTime = 10_000;
  const statuses = new Map(batch.rows.map((row) => [row.id, "PENDING"]));
  const transitions: string[] = [];
  const execution = createImageSetExecution(currentTime, "lease-deadline");
  const running = runImageSetBatch(batch, {
    ...fakeDeps(),
    generateRole: async ({ role }) => {
      if (role === "hero") await generationGate;
      return { buffer: Buffer.from(role), contentType: "image/png", provider: `provider:${role}` };
    },
    transitionRow: async (id, from, data) => {
      if (!from.includes(statuses.get(id) as "PENDING" | "GENERATING" | "DONE" | "FAILED")) return false;
      statuses.set(id, data.status ?? statuses.get(id)!);
      transitions.push(`${id}:${data.status}`);
      return true;
    },
    failUnfinishedRows: async (rows) => {
      for (const { id } of rows) {
        const status = statuses.get(id);
        if (status === "PENDING" || status === "GENERATING") statuses.set(id, "FAILED");
      }
      transitions.push(`deadline:${rows.map((row) => row.errorMessage).join("|")}`);
    },
    setDeadlineTimer: (callback, delayMs) => {
      assert.equal(delayMs, 270_000);
      fireDeadline = () => {
        currentTime += delayMs;
        callback();
      };
      return 1;
    },
    clearDeadlineTimer: () => {},
    now: () => currentTime,
  }, execution);
  await new Promise((resolve) => setImmediate(resolve));
  fireDeadline();
  const result = await running;
  assert.equal(statuses.get("row-hero"), "FAILED");
  assert.equal(statuses.get("row-detail"), "FAILED");
  assert.equal(result.statuses.hero, "FAILED");
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(statuses.get("row-hero"), "FAILED");
  assert.ok(!transitions.includes("row-hero:DONE"));
});

test("uses the route invocation timestamp as the single absolute deadline", async () => {
  const execution = createImageSetExecution(10_000, "lease-route");
  assert.deepEqual(execution, { leaseId: "lease-route", deadlineAt: 280_000 });

  const product = storedProduct();
  const expectedHash = (await import("./product-visual-profile.ts")).computeProductVisualSourceHash({
    ...product,
    rawImageUrls: JSON.parse(product.rawImageUrls),
  });
  product.visualProfileSourceHash = expectedHash;
  const callbacks: Array<() => Promise<unknown>> = [];
  let seenDeadline = 0;
  await createAndScheduleImageSetBatch({
    product,
    client: null,
    selectedRoles: ["hero"],
    requestSourceHash: expectedHash,
    execution,
  }, {
    claimProductLease: async () => true,
    releaseProductLease: async () => {},
    createRows: async () => [{ id: "created-hero" }],
    scheduleAfter: (callback) => { callbacks.push(callback); },
    runBatch: async (_input, scheduledExecution) => { seenDeadline = scheduledExecution.deadlineAt; },
    createBatchId: () => "batch-fixed",
  });
  await callbacks[0]();
  assert.equal(seenDeadline, 280_000);
});

test("an expired absolute deadline aborts in-flight work and launches no later roles", async () => {
  const batch = input();
  batch.rows = [batch.rows[0], batch.rows[1]];
  let fireDeadline!: () => void;
  let currentTime = 1_000;
  const attempts: string[] = [];
  const running = runImageSetBatch(batch, {
    ...fakeDeps(),
    generateRole: async ({ role, signal, deadlineAt }) => {
      attempts.push(role);
      assert.ok(signal);
      assert.equal(deadlineAt, 1_500);
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    },
    setDeadlineTimer: (callback, delayMs) => {
      assert.equal(delayMs, 500);
      fireDeadline = () => { currentTime += delayMs; callback(); };
      return 1;
    },
    clearDeadlineTimer: () => {},
    failUnfinishedRows: async () => {},
    now: () => currentTime,
  }, { leaseId: "lease-short", deadlineAt: 1_500 });
  await new Promise((resolve) => setImmediate(resolve));
  fireDeadline();
  await running;
  assert.deepEqual(attempts, ["hero"]);
});

test("deletes a saved orphan when the DONE compare-and-set loses ownership", async () => {
  const batch = input();
  batch.rows = [batch.rows[0]];
  const deleted: string[] = [];
  let transitions = 0;
  const result = await runImageSetBatch(batch, {
    ...fakeDeps(),
    transitionRow: async (_id, _from, data) => {
      transitions += 1;
      return data.status !== "DONE";
    },
    saveBuffer: async () => "https://blob.example/orphan.png",
    cleanupOrphanAsset: async ({ assetUrl }) => {
      deleted.push(assetUrl);
      return { resolved: true, deleted: true };
    },
  }, createImageSetExecution(Date.now(), "lease-orphan"));
  assert.equal(transitions >= 2, true);
  assert.equal(result.statuses.hero, "FAILED");
  assert.deepEqual(deleted, ["https://blob.example/orphan.png"]);
});

test("batch finalization honors the cleanup tombstone adoption barrier", async () => {
  const batch = input();
  batch.rows = [batch.rows[0]];
  let ordinaryTransitions = 0;
  let completions = 0;
  const cleaned: string[] = [];
  const result = await runImageSetBatch(batch, {
    ...fakeDeps(),
    transitionRow: async () => { ordinaryTransitions += 1; return true; },
    completeRow: async () => { completions += 1; return false; },
    saveBuffer: async () => "https://blob.example/adoption-blocked.png",
    cleanupOrphanAsset: async ({ assetUrl }) => {
      cleaned.push(assetUrl);
      return { resolved: true, deleted: true };
    },
  }, createImageSetExecution(Date.now(), "lease-adoption-blocked"));

  assert.equal(completions, 1);
  assert.equal(ordinaryTransitions >= 1, true);
  assert.equal(result.statuses.hero, "FAILED");
  assert.deepEqual(cleaned, ["https://blob.example/adoption-blocked.png"]);
});

test("orphan cleanup durably records first, retries transient deletes, then resolves its exact job", async () => {
  const input = {
    productId: "product-1",
    libraryImageId: "row-old",
    generationLeaseId: "lease-old",
    assetUrl: "https://blob.example/transient-orphan.png",
  };
  let job: ImageSetOrphanCleanupJob | null = null;
  let deleteAttempts = 0;
  const waits: number[] = [];
  const result = await cleanupImageSetOrphanAsset(input, {
    upsertCleanupJob: async (value) => {
      job ??= { id: "cleanup-1", ...value, attempts: 0 };
      return job;
    },
    claimCleanupJob: async () => true,
    claimOrphanDeletion: async () => "claimed" as const,
    isCurrentAsset: async () => false,
    deleteAsset: async () => {
      deleteAttempts += 1;
      if (deleteAttempts < 3) throw new Error("temporary blob outage");
    },
    completeCleanupJob: async (value) => {
      if (!job || job.id !== value.id || job.generationLeaseId !== value.generationLeaseId || job.assetUrl !== value.assetUrl) return false;
      job = null;
      return true;
    },
    recordCleanupFailure: async (value, _execution, errorMessage) => {
      assert.equal(job?.id, value.id);
      if (job) job = { ...job, attempts: job.attempts + 1, lastError: errorMessage };
    },
    releaseCleanupJob: async () => true,
    createCleanupLease: () => ({ leaseId: "cleaner-transient", deadlineAt: 20_000 }),
    waitForRetry: async (delayMs) => { waits.push(delayMs); },
    logError: () => {},
  });

  assert.deepEqual(result, { resolved: true, deleted: true });
  assert.equal(deleteAttempts, 3);
  assert.deepEqual(waits, [250, 1_000]);
  assert.equal(job, null);
});

test("cleanup falls back to a bounded direct delete when the durable record cannot be written", async () => {
  let deleteAttempts = 0;
  const waits: number[] = [];
  const result = await cleanupImageSetOrphanAsset({
    productId: "product-1",
    libraryImageId: "row-old",
    generationLeaseId: "lease-old",
    assetUrl: "https://blob.example/db-outage.png",
  }, {
    upsertCleanupJob: async () => { throw new Error("database unavailable"); },
    claimCleanupJob: async () => false,
    claimOrphanDeletion: async () => "claimed" as const,
    isCurrentAsset: async () => false,
    deleteAsset: async () => {
      deleteAttempts += 1;
      if (deleteAttempts < 2) throw new Error("temporary blob outage");
    },
    completeCleanupJob: async () => true,
    recordCleanupFailure: async () => {},
    releaseCleanupJob: async () => true,
    createCleanupLease: () => ({ leaseId: "cleaner-direct", deadlineAt: 20_000 }),
    waitForRetry: async (delayMs) => { waits.push(delayMs); },
    logError: () => {},
  });
  assert.deepEqual(result, { resolved: true, deleted: true });
  assert.equal(deleteAttempts, 2);
  assert.deepEqual(waits, [250, 1_000, 250]);
});

test("direct cleanup fallback fails closed when the URL is already a current asset", async () => {
  let deleted = false;
  const result = await cleanupImageSetOrphanAsset({
    productId: "product-1",
    libraryImageId: "row-old",
    generationLeaseId: "lease-old",
    assetUrl: "https://blob.example/already-adopted.png",
  }, {
    upsertCleanupJob: async () => { throw new Error("database unavailable"); },
    claimCleanupJob: async () => false,
    claimOrphanDeletion: async () => "claimed" as const,
    isCurrentAsset: async () => true,
    deleteAsset: async () => { deleted = true; },
    completeCleanupJob: async () => true,
    recordCleanupFailure: async () => {},
    releaseCleanupJob: async () => true,
    createCleanupLease: () => ({ leaseId: "cleaner-direct-current", deadlineAt: 20_000 }),
    waitForRetry: async () => {},
    logError: () => {},
  });
  assert.deepEqual(result, { resolved: false, deleted: false });
  assert.equal(deleted, false);
});

test("direct cleanup fallback does not delete when the generation-lease CAS loses the adoption race", async () => {
  let deleted = false;
  const result = await cleanupImageSetOrphanAsset({
    productId: "product-1",
    libraryImageId: "row-raced",
    generationLeaseId: "lease-raced",
    assetUrl: "https://blob.example/raced-adoption.png",
  }, {
    upsertCleanupJob: async () => { throw new Error("database unavailable"); },
    claimCleanupJob: async () => false,
    claimOrphanDeletion: async () => "blocked",
    isCurrentAsset: async () => false,
    deleteAsset: async () => { deleted = true; },
    completeCleanupJob: async () => true,
    recordCleanupFailure: async () => {},
    releaseCleanupJob: async () => true,
    createCleanupLease: () => ({ leaseId: "cleaner-raced", deadlineAt: 20_000 }),
    waitForRetry: async () => {},
    logError: () => {},
  });
  assert.deepEqual(result, { resolved: false, deleted: false });
  assert.equal(deleted, false);
});

test("direct cleanup can remove an old URL after the original row is gone or replaced", async () => {
  let deleted = 0;
  for (const claim of ["safe_without_original_lease", "safe_without_original_lease"] as const) {
    const result = await cleanupImageSetOrphanAsset({
      productId: "product-1",
      libraryImageId: `row-${deleted}`,
      generationLeaseId: "lease-old",
      assetUrl: `https://blob.example/replaced-${deleted}.png`,
    }, {
      upsertCleanupJob: async () => { throw new Error("database unavailable"); },
      claimCleanupJob: async () => false,
      claimOrphanDeletion: async () => claim,
      isCurrentAsset: async () => false,
      deleteAsset: async () => { deleted += 1; },
      completeCleanupJob: async () => true,
      recordCleanupFailure: async () => {},
      releaseCleanupJob: async () => true,
      createCleanupLease: () => ({ leaseId: "cleaner-safe", deadlineAt: 20_000 }),
      waitForRetry: async () => {},
      logError: () => {},
    });
    assert.deepEqual(result, { resolved: true, deleted: true });
  }
  assert.equal(deleted, 2);
});

test("direct cleanup removes the old URL when a replacement worker completed with a different URL", async () => {
  let deleted = false;
  const result = await cleanupImageSetOrphanAsset({
    productId: "product-1",
    libraryImageId: "row-replaced-done",
    generationLeaseId: "lease-old",
    assetUrl: "https://blob.example/old.png",
  }, {
    upsertCleanupJob: async () => { throw new Error("database unavailable"); },
    claimCleanupJob: async () => false,
    claimOrphanDeletion: async () => "safe_without_original_lease" as const,
    isCurrentAsset: async () => false,
    deleteAsset: async () => { deleted = true; },
    completeCleanupJob: async () => true,
    recordCleanupFailure: async () => {},
    releaseCleanupJob: async () => true,
    createCleanupLease: () => ({ leaseId: "cleaner-replaced-done", deadlineAt: 20_000 }),
    waitForRetry: async () => {},
    logError: () => {},
  });
  assert.deepEqual(result, { resolved: true, deleted: true });
  assert.equal(deleted, true);
});

test("persistent orphan delete failure survives and a later stale reconciliation completes it", async () => {
  const orphan = {
    productId: "product-1",
    libraryImageId: "row-old",
    generationLeaseId: "lease-old",
    assetUrl: "https://blob.example/persistent-orphan.png",
  };
  let job: ImageSetOrphanCleanupJob | null = null;
  let failDeletes = true;
  let deleteAttempts = 0;
  let recordedAttempts = 0;
  const cleanupDependencies = {
    upsertCleanupJob: async (value: typeof orphan) => {
      job ??= { id: "cleanup-persistent", ...value, attempts: 0 };
      return job;
    },
    claimCleanupJob: async () => true,
    claimOrphanDeletion: async () => "claimed" as const,
    isCurrentAsset: async () => false,
    deleteAsset: async () => {
      deleteAttempts += 1;
      if (failDeletes) throw new Error("blob unavailable");
    },
    completeCleanupJob: async (value: ImageSetOrphanCleanupJob) => {
      if (!job || job.id !== value.id || job.generationLeaseId !== value.generationLeaseId || job.assetUrl !== value.assetUrl) return false;
      job = null;
      return true;
    },
    recordCleanupFailure: async (_value: ImageSetOrphanCleanupJob, _execution: { leaseId: string; deadlineAt: number }, errorMessage: string) => {
      recordedAttempts += 1;
      if (job) job = { ...job, attempts: recordedAttempts, lastError: errorMessage };
    },
    releaseCleanupJob: async () => true,
    createCleanupLease: () => ({ leaseId: "cleaner-persistent", deadlineAt: 20_000 }),
    waitForRetry: async () => {},
    logError: () => {},
  };

  const first = await cleanupImageSetOrphanAsset(orphan, cleanupDependencies);
  assert.deepEqual(first, { resolved: false, deleted: false });
  assert.equal(recordedAttempts, 3);

  failDeletes = false;
  const reconciled = await reconcileStaleImageSetWork("product-1", new Date("2026-09-07T10:00:00.000Z"), {
    listExpiredRows: async () => [],
    failExpiredRow: async () => false,
    releaseExpiredProductLease: async () => false,
    listOrphanCleanupJobs: async () => job ? [job] : [],
    cleanupOrphanAsset: (value) => cleanupImageSetOrphanAsset(value, cleanupDependencies),
  });
  assert.deepEqual(reconciled, { failedRows: 0, releasedProductLease: false, cleanedAssets: 1 });
  assert.equal(deleteAttempts, 4);
  assert.equal(job, null);
});

test("orphan reconciliation never deletes an asset that is now the successful current row", async () => {
  let deleted = false;
  let completed = false;
  const result = await cleanupImageSetOrphanAsset({
    productId: "product-1",
    libraryImageId: "row-current",
    generationLeaseId: "lease-old",
    assetUrl: "https://blob.example/current.png",
  }, {
    upsertCleanupJob: async (value) => ({ id: "cleanup-current", ...value, attempts: 0 }),
    claimCleanupJob: async () => true,
    claimOrphanDeletion: async () => "claimed",
    isCurrentAsset: async () => true,
    deleteAsset: async () => { deleted = true; },
    completeCleanupJob: async () => { completed = true; return true; },
    recordCleanupFailure: async () => {},
    releaseCleanupJob: async () => true,
    createCleanupLease: () => ({ leaseId: "cleaner-current", deadlineAt: 20_000 }),
    waitForRetry: async () => {},
    logError: () => {},
  });
  assert.deepEqual(result, { resolved: true, deleted: false });
  assert.equal(deleted, false);
  assert.equal(completed, true);
});

test("a cleaner that loses the tombstone lease performs no blob deletion", async () => {
  let deleted = false;
  const result = await cleanupImageSetOrphanAsset({
    productId: "product-1",
    libraryImageId: "row-old",
    generationLeaseId: "generation-old",
    assetUrl: "https://blob.example/claimed-by-other-worker.png",
  }, {
    upsertCleanupJob: async (value) => ({ id: "cleanup-claimed", ...value, attempts: 0 }),
    claimCleanupJob: async () => false,
    claimOrphanDeletion: async () => "blocked",
    isCurrentAsset: async () => false,
    deleteAsset: async () => { deleted = true; },
    completeCleanupJob: async () => true,
    recordCleanupFailure: async () => {},
    releaseCleanupJob: async () => true,
    createCleanupLease: () => ({ leaseId: "cleaner-loser", deadlineAt: 20_000 }),
    waitForRetry: async () => {},
    logError: () => {},
  });
  assert.deepEqual(result, { resolved: false, deleted: false });
  assert.equal(deleted, false);
});

test("passes the request deadline signal into the asset save", async () => {
  const batch = input();
  batch.rows = [batch.rows[0]];
  let saveSignal: AbortSignal | undefined;
  await runImageSetBatch(batch, {
    ...fakeDeps(),
    saveBuffer: async (_buffer, _extension, _prefix, signal) => {
      saveSignal = signal;
      return "/uploads/saved.png";
    },
  }, createImageSetExecution(Date.now(), "lease-save"));
  assert.ok(saveSignal);
  assert.equal(saveSignal.aborted, false);
});

test("retries deadline cleanup inside the buffer and leaves durable reconciliation metadata", async () => {
  const batch = input();
  batch.rows = [batch.rows[0]];
  let fireDeadline!: () => void;
  let cleanupAttempts = 0;
  const waits: number[] = [];
  const running = runImageSetBatch(batch, {
    ...fakeDeps(),
    generateRole: async ({ signal }) => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true })),
    setDeadlineTimer: (callback) => { fireDeadline = callback; return 1; },
    clearDeadlineTimer: () => {},
    failUnfinishedRows: async (rows, execution) => {
      cleanupAttempts += 1;
      assert.equal(execution.leaseId, "lease-cleanup");
      assert.equal(rows[0].id, "row-hero");
      if (cleanupAttempts < 3) throw new Error("temporary database outage");
    },
    waitForCleanupRetry: async (delayMs) => { waits.push(delayMs); },
    now: () => 1_000,
  }, { leaseId: "lease-cleanup", deadlineAt: 1_500 });
  await new Promise((resolve) => setImmediate(resolve));
  fireDeadline();
  await running;
  assert.equal(cleanupAttempts, 3);
  assert.deepEqual(waits, [1_000, 3_000]);
});

test("deadline abort cannot return before its cleanup attempt finishes", async () => {
  const batch = input();
  batch.rows = [batch.rows[0]];
  let fireDeadline!: () => void;
  let releaseCleanup!: () => void;
  const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
  let settled = false;
  const running = runImageSetBatch(batch, {
    ...fakeDeps(),
    generateRole: async ({ signal }) => new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
    setDeadlineTimer: (callback) => { fireDeadline = callback; return 1; },
    clearDeadlineTimer: () => {},
    failUnfinishedRows: async () => cleanupGate,
    now: () => 1_000,
  }, { leaseId: "lease-cleanup-gate", deadlineAt: 1_500 });
  void running.then(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  fireDeadline();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  releaseCleanup();
  await running;
  assert.equal(settled, true);
});

test("reconciles only rows whose status, lease ownership and expiry are still stale", async () => {
  const now = new Date("2026-09-07T10:00:00.000Z");
  const observed = [{
    id: "row-stale",
    assetRole: "hero" as const,
    generationLeaseId: "lease-old",
    generationLeaseExpiresAt: new Date("2026-09-07T09:59:00.000Z"),
  }];
  const failed: unknown[] = [];
  const released: unknown[] = [];
  const result = await reconcileStaleImageSetWork("product-1", now, {
    listExpiredRows: async () => observed,
    failExpiredRow: async (row, cutoff) => { failed.push({ row, cutoff }); return true; },
    releaseExpiredProductLease: async (productId, cutoff) => { released.push({ productId, cutoff }); return true; },
    listOrphanCleanupJobs: async () => [],
    cleanupOrphanAsset: async () => ({ resolved: true, deleted: true }),
  });
  assert.deepEqual(result, { failedRows: 1, releasedProductLease: true, cleanedAssets: 0 });
  assert.deepEqual(failed, [{ row: observed[0], cutoff: now }]);
  assert.deepEqual(released, [{ productId: "product-1", cutoff: now }]);
});

test("global cleanup reconciliation drains jobs after their product is gone", async () => {
  const jobs = [
    { id: "cleanup-1", productId: "deleted-product", libraryImageId: "row-1", generationLeaseId: "lease-1", assetUrl: "https://blob.example/one.png", attempts: 0 },
    { id: "cleanup-2", productId: "deleted-product", libraryImageId: "row-2", generationLeaseId: "lease-2", assetUrl: "https://blob.example/two.png", attempts: 0 },
  ] as ImageSetOrphanCleanupJob[];
  const cleaned: string[] = [];
  const count = await reconcileImageSetCleanupJobs(25, {
    listOrphanCleanupJobs: async (limit) => jobs.slice(0, limit),
    cleanupOrphanAsset: async (job) => {
      cleaned.push(job.assetUrl);
      return { resolved: true, deleted: true };
    },
  });
  assert.equal(count, 2);
  assert.deepEqual(cleaned, ["https://blob.example/one.png", "https://blob.example/two.png"]);
});

test("active product lease rejects a duplicate batch before rows or callbacks are created", async () => {
  const product = storedProduct();
  const expectedHash = (await import("./product-visual-profile.ts")).computeProductVisualSourceHash({
    ...product,
    rawImageUrls: JSON.parse(product.rawImageUrls),
  });
  product.visualProfileSourceHash = expectedHash;
  let creates = 0;
  let schedules = 0;
  const response = await createAndScheduleImageSetBatch({
    product,
    client: null,
    selectedRoles: ["hero"],
    requestSourceHash: expectedHash,
    execution: createImageSetExecution(10_000, "lease-loser"),
  }, {
    claimProductLease: async () => false,
    releaseProductLease: async () => {},
    createRows: async () => { creates += 1; return []; },
    scheduleAfter: () => { schedules += 1; },
    runBatch: async () => {},
    createBatchId: () => "batch-duplicate",
  });
  assert.deepEqual(response, { ok: false, status: 409, error: "這項產品已有套圖正在生成，請等待完成後再試。" });
  assert.equal(creates, 0);
  assert.equal(schedules, 0);
});

test("new product-body cutouts require an uploaded original instead of an existing hero derivative", async () => {
  const product = storedProduct();
  product.rawImageUrls = "[]";
  const expectedHash = (await import("./product-visual-profile.ts")).computeProductVisualSourceHash({
    ...product,
    rawImageUrls: JSON.parse(product.rawImageUrls),
  });
  product.visualProfileSourceHash = expectedHash;
  let claimed = 0;
  const response = await createAndScheduleImageSetBatch({
    product,
    client: null,
    selectedRoles: ["hero"],
    requestSourceHash: expectedHash,
    execution: createImageSetExecution(10_000, "lease-no-raw"),
  }, {
    claimProductLease: async () => { claimed += 1; return true; },
    releaseProductLease: async () => {},
    createRows: async () => [],
    scheduleAfter: () => {},
    runBatch: async () => {},
    createBatchId: () => "batch-no-raw",
  });
  assert.deepEqual(response, { ok: false, status: 400, error: "需要至少一張原始商品照，才能建立商品主體去背 PNG。" });
  assert.equal(claimed, 0);
});

test("batch and retry routes stay within the Vercel Hobby 300s cap (290s) for the 270s internal cleanup deadline", async () => {
  const batchRoute = await readFile(new URL("../../app/api/products/[productId]/image-set/route.ts", import.meta.url), "utf8");
  const retryRoute = await readFile(new URL("../../app/api/library/images/[id]/regenerate/route.ts", import.meta.url), "utf8");
  assert.match(batchRoute, /export const maxDuration = 290/);
  assert.match(retryRoute, /export const maxDuration = 290/);
});

function storedProduct(): StoredImageSetProduct {
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
    persistProfile: async () => { writes += 1; return true; },
  });
  assert.equal(response.needsAnalysis, false);
  assert.equal(response.hasHero, true);
  assert.equal(response.sourceImageCount, 2);
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
  assert.equal(response.sourceImageCount, 2);
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
    now: () => new Date(10_000),
    persistProfile: async (_id: string, data: { visualProfileJson: string; visualProfileSourceHash: string }) => {
      writes.push(data);
      return true;
    },
  };

  const cached = await analyzeImageSetProduct(product, null, false, deps);
  assert.equal(cached.cached, true);
  assert.equal(analyzes, 0);
  assert.equal(writes.length, 0);

  const forced = await analyzeImageSetProduct(
    product,
    null,
    true,
    deps,
    undefined,
    { leaseId: "analysis-force", deadlineAt: 20_000 },
  );
  assert.equal(forced.cached, false);
  assert.equal(forced.profile.productType, "重新分析後");
  assert.equal(analyzes, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].visualProfileSourceHash, expectedHash);
  assert.equal(JSON.parse(writes[0].visualProfileJson).productType, "重新分析後");
});

test("analysis result arriving after its deadline is never persisted", async () => {
  const product = storedProduct();
  const controller = new AbortController();
  let writes = 0;
  await assert.rejects(analyzeImageSetProduct(product, null, true, {
    analyze: async () => {
      controller.abort(new Error("analysis deadline"));
      return profile;
    },
    persistProfile: async () => { writes += 1; return true; },
  }, controller.signal), /analysis deadline/);
  assert.equal(writes, 0);
});

test("analysis persistence cannot overwrite a newer worker after the product lease transfers", async () => {
  const product = storedProduct();
  const oldExecution = { leaseId: "analysis-old", deadlineAt: 20_000 };
  let leaseOwner = oldExecution.leaseId;
  let storedProductType = "new-worker-profile";
  let persistenceCheckedAtMs = -1;

  await assert.rejects(analyzeImageSetProduct(product, null, true, {
    analyze: async () => ({ ...profile, productType: "stale-old-profile" }),
    now: () => new Date(10_000),
    persistProfile: async (productId, data, execution, checkedAt) => {
      assert.equal(productId, product.id);
      assert.deepEqual(execution, oldExecution);
      persistenceCheckedAtMs = checkedAt.getTime();
      leaseOwner = "analysis-new";
      if (!execution || leaseOwner !== execution.leaseId) return false;
      storedProductType = JSON.parse(data.visualProfileJson).productType;
      return true;
    },
  }, undefined, oldExecution), /analysis lease ownership was lost/i);

  assert.equal(leaseOwner, "analysis-new");
  assert.equal(storedProductType, "new-worker-profile");
  assert.equal(persistenceCheckedAtMs, 10_000);
});

test("force analysis cooldown rejects before lease acquisition or provider work", async () => {
  const product = storedProduct();
  product.visualProfileUpdatedAt = new Date("2026-09-07T10:00:00.000Z");
  let claims = 0;
  let analyzes = 0;
  const response = await requestImageSetAnalysis({
    product,
    client: null,
    force: true,
    execution: { leaseId: "analysis-cooldown", deadlineAt: Date.parse("2026-09-07T10:02:00.000Z") },
  }, {
    now: () => Date.parse("2026-09-07T10:00:30.000Z"),
    claimProductLease: async () => { claims += 1; return true; },
    releaseProductLease: async () => {},
    analyze: async () => { analyzes += 1; return { ok: true }; },
  });
  assert.deepEqual(response, { ok: false, status: 429, error: "產品剛完成分析，請稍候一分鐘再強制重新分析。" });
  assert.equal(claims, 0);
  assert.equal(analyzes, 0);
});

test("analysis lease race rejects duplicate paid work and successful work releases its lease", async () => {
  const product = storedProduct();
  product.visualProfileUpdatedAt = null;
  const execution = createImageSetExecution(10_000, "analysis-lease");
  let analyzes = 0;
  let releases = 0;
  const dependencies = {
    now: () => 10_000,
    claimProductLease: async () => false,
    releaseProductLease: async () => { releases += 1; },
    analyze: async () => { analyzes += 1; return { profile }; },
  };
  const rejected = await requestImageSetAnalysis({ product, client: null, force: true, execution }, dependencies);
  assert.deepEqual(rejected, { ok: false, status: 409, error: "這項產品已有付費處理正在進行，請稍候再試。" });
  assert.equal(analyzes, 0);

  const accepted = await requestImageSetAnalysis(
    { product, client: null, force: true, execution },
    { ...dependencies, claimProductLease: async () => true },
  );
  assert.equal(accepted.ok, true);
  assert.equal(analyzes, 1);
  assert.equal(releases, 1);
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
    execution: createImageSetExecution(10_000, "lease-create"),
  }, {
    claimProductLease: async () => true,
    releaseProductLease: async () => {},
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

test("batch scheduling failure releases the durable product lease", async () => {
  const product = storedProduct();
  const expectedHash = (await import("./product-visual-profile.ts")).computeProductVisualSourceHash({
    ...product,
    rawImageUrls: JSON.parse(product.rawImageUrls),
  });
  product.visualProfileSourceHash = expectedHash;
  let releases = 0;
  await assert.rejects(createAndScheduleImageSetBatch({
    product,
    client: null,
    selectedRoles: ["hero"],
    requestSourceHash: expectedHash,
    execution: createImageSetExecution(10_000, "lease-schedule-failed"),
  }, {
    claimProductLease: async () => true,
    releaseProductLease: async () => { releases += 1; },
    createRows: async () => [{ id: "created-hero" }],
    failCreatedRows: async (rowIds, execution) => {
      assert.deepEqual(rowIds, ["created-hero"]);
      assert.equal(execution.leaseId, "lease-schedule-failed");
      return true;
    },
    scheduleAfter: () => { throw new Error("after unavailable"); },
    runBatch: async () => {},
    createBatchId: () => "batch-schedule-failed",
  }), /after unavailable/);
  assert.equal(releases, 1);
});

test("stale retry returns 409 Traditional Chinese guidance and mutates no row", async () => {
  let updates = 0;
  let schedules = 0;
  const response = await requestImageSetRegeneration("row-stale", createImageSetExecution(10_000, "retry-stale"), {
    prepare: async () => ({ ok: false as const, status: 409 as const, error: "商品資料已更新，請先重新分析產品後再重新產生這張素材。" }),
    claimFailedRow: async () => { updates += 1; return true; },
    rollbackClaimedRow: async () => true,
    scheduleAfter: () => { schedules += 1; },
    regenerate: async () => ({ statuses: {}, params: {} }),
  });
  assert.deepEqual(response, { ok: false, status: 409, error: "商品資料已更新，請先重新分析產品後再重新產生這張素材。" });
  assert.match(response.error, /請先重新分析產品/);
  assert.equal(updates, 0);
  assert.equal(schedules, 0);
});

test("retry preparation accepts a legacy lifestyle row and preserves its saved edit role spec", async () => {
  const product = storedProduct();
  const sourceHash = (await import("./product-visual-profile.ts")).computeProductVisualSourceHash({
    ...product,
    rawImageUrls: JSON.parse(product.rawImageUrls),
  });
  product.visualProfileSourceHash = sourceHash;
  const savedRole = { ...roles[2], sceneCn: "使用者確認過的專屬使用情境構圖" };
  const row = {
    id: "row-lifestyle",
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
  if (prepared.ok) {
    assert.equal(prepared.value.input.rows[0].role.role, "lifestyle");
    assert.equal(prepared.value.input.rows[0].role.sceneCn, "使用者確認過的專屬使用情境構圖");
  }

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
  const response = await requestImageSetRegeneration("row-target", createImageSetExecution(10_000, "retry-target"), {
    prepare: async () => ({ ok: true as const, value: prepared }),
    claimFailedRow: async (id) => { updates.push(id); return true; },
    rollbackClaimedRow: async () => true,
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

test("retry returns 409 and schedules nothing when FAILED compare-and-set loses the race", async () => {
  let schedules = 0;
  const prepared = { rowId: "row-target", input: { ...input(), rows: [{ id: "row-target", role: roles[1] }] } };
  const response = await requestImageSetRegeneration("row-target", createImageSetExecution(10_000, "retry-race"), {
    prepare: async () => ({ ok: true as const, value: prepared }),
    claimFailedRow: async () => false,
    rollbackClaimedRow: async () => true,
    scheduleAfter: () => { schedules += 1; },
    regenerate: async () => ({ statuses: {}, params: {} }),
  });
  assert.deepEqual(response, { ok: false, status: 409, error: "這張素材目前無法重新產生，請確認狀態為失敗後再試一次。" });
  assert.equal(schedules, 0);
});

test("retry scheduling failure rolls the exact claimed lease back to FAILED immediately", async () => {
  const execution = createImageSetExecution(10_000, "retry-schedule-failed");
  const prepared = { rowId: "row-target", input: { ...input(), rows: [{ id: "row-target", role: roles[1] }] } };
  const row: { status: "FAILED" | "GENERATING"; leaseId: string | null } = { status: "FAILED", leaseId: null };

  await assert.rejects(requestImageSetRegeneration("row-target", execution, {
    prepare: async () => ({ ok: true as const, value: prepared }),
    claimFailedRow: async () => {
      row.status = "GENERATING";
      row.leaseId = execution.leaseId;
      return true;
    },
    rollbackClaimedRow: async (_rowId, claimedExecution) => {
      if (row.status !== "GENERATING" || row.leaseId !== claimedExecution.leaseId) return false;
      row.status = "FAILED";
      row.leaseId = null;
      return true;
    },
    scheduleAfter: () => { throw new Error("after registration failed"); },
    regenerate: async () => ({ statuses: {}, params: {} }),
  }), /after registration failed/);

  assert.deepEqual(row, { status: "FAILED", leaseId: null });
});

test("retry rollback failure retains its lease for stale recovery and emits durable-recovery evidence", async () => {
  const execution = createImageSetExecution(10_000, "retry-rollback-failed");
  const prepared = { rowId: "row-target", input: { ...input(), rows: [{ id: "row-target", role: roles[1] }] } };
  const row = { status: "GENERATING", leaseId: execution.leaseId, expiresAt: execution.deadlineAt };
  const logs: unknown[][] = [];

  await assert.rejects(requestImageSetRegeneration("row-target", execution, {
    prepare: async () => ({ ok: true as const, value: prepared }),
    claimFailedRow: async () => true,
    rollbackClaimedRow: async () => { throw new Error("database unavailable"); },
    scheduleAfter: () => { throw new Error("after registration failed"); },
    regenerate: async () => ({ statuses: {}, params: {} }),
    logError: (...values) => { logs.push(values); },
  }), /after registration failed/);

  assert.deepEqual(row, { status: "GENERATING", leaseId: "retry-rollback-failed", expiresAt: 280_000 });
  assert.match(String(logs[0]?.[0]), /stale lease retained for reconciliation/);
  assert.deepEqual(logs[0]?.[1], {
    rowId: "row-target",
    leaseId: "retry-rollback-failed",
    error: new Error("database unavailable"),
  });
});
