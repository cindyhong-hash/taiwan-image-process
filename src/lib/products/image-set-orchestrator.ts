import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { db } from "../db.ts";
import { deleteStoredAsset, loadBuffer, saveBuffer } from "../storage.ts";
import { compileImageSetPrompt } from "./image-set-prompts.ts";
import { generateImageSetRole, type ImageSetRoleGenerationInput, type ImageSetRoleGenerationOutput } from "./image-set-model-router.ts";
import {
  analyzeProductVisualProfile,
  buildImageSetArtDirection,
  countProductVisualReferenceImages,
  type ImageSetArtDirection,
} from "./product-visual-analysis.ts";
import {
  computeProductVisualSourceHash,
  fallbackProductVisualProfile,
  parseProductVisualProfile,
  type ProductVisualProfile,
} from "./product-visual-profile.ts";
import { planImageSetRoles, type ImageSetRole, type ImageSetRoleSpec } from "./image-set-roles.ts";
import {
  claimImageAssetCleanupJobLease,
  completeGeneratedImageSetRowWithLease,
  persistProductVisualProfileWithLease,
} from "./image-set-db-operations.ts";

export type ImageSetProduct = {
  id: string;
  clientId: string;
  name: string;
  category: string | null;
  description: string | null;
  primaryColorOverride: string | null;
  rawImageUrls: string[];
  heroImageUrl: string | null;
};

export type StoredImageSetProduct = Omit<ImageSetProduct, "rawImageUrls"> & {
  rawImageUrls: string;
  visualProfileJson: string;
  visualProfileSourceHash: string | null;
  visualProfileUpdatedAt?: Date | null;
};

export type ImageSetClient = {
  primaryColor?: string | null;
  toneLabels?: string | null;
} | null;

export type ImageSetRow = { id: string; role: ImageSetRoleSpec };
export type ImageSetRowStatus = "PENDING" | "GENERATING" | "DONE" | "FAILED";
// 對齊 Vercel Hobby 300s 硬上限：route maxDuration=290，內部 deadline 設 270s，
// 讓 orchestrator 在函式被平台砍之前先把未完成的列標 FAILED（不留孤兒列）。
// 升級 Pro/Enterprise 後可連同 route maxDuration 一起調高。
export const IMAGE_SET_BATCH_DEADLINE_MS = 270_000;
export type ImageSetExecution = { leaseId: string; deadlineAt: number };

export function createImageSetExecution(
  invocationStartedAt: number,
  leaseId: string,
  budgetMs = IMAGE_SET_BATCH_DEADLINE_MS,
): ImageSetExecution {
  return { leaseId, deadlineAt: invocationStartedAt + budgetMs };
}

export async function claimProductPaidOperationLease(
  productId: string,
  execution: ImageSetExecution,
  kind: "analysis" | "batch",
  now = new Date(),
): Promise<boolean> {
  const result = await db.product.updateMany({
    where: {
      id: productId,
      assets: {
        none: {
          status: { in: ["PENDING", "GENERATING"] },
          generationLeaseExpiresAt: { gt: now },
        },
      },
      OR: [
        { paidOperationLeaseId: null },
        { paidOperationLeaseExpiresAt: { lte: now } },
      ],
    },
    data: {
      paidOperationLeaseId: execution.leaseId,
      paidOperationLeaseExpiresAt: new Date(execution.deadlineAt),
      paidOperationKind: kind,
    },
  });
  return result.count === 1;
}

export async function releaseProductPaidOperationLease(productId: string, leaseId: string): Promise<boolean> {
  const result = await db.product.updateMany({
    where: { id: productId, paidOperationLeaseId: leaseId },
    data: { paidOperationLeaseId: null, paidOperationLeaseExpiresAt: null, paidOperationKind: null },
  });
  return result.count === 1;
}

type ImageSetRowMutation = {
  status?: ImageSetRowStatus;
  imageUrl?: string;
  prompt?: string;
  paramsJson?: string;
  errorMessage?: string | null;
  generationLeaseId?: string | null;
  generationLeaseExpiresAt?: Date | null;
};

export type ImageSetRowParams = {
  imageSet: true;
  profileVersion: 1;
  sourceHash: string;
  artDirection: ImageSetArtDirection;
  roleSpec: ImageSetRoleSpec;
  provider?: string;
};

export type ImageSetBatchInput = {
  batchId: string;
  sourceHash: string;
  profile: ProductVisualProfile;
  artDirection: ImageSetArtDirection;
  product: ImageSetProduct;
  rows: ImageSetRow[];
};

export type ImageSetBatchDependencies = {
  updateRow?: (id: string, data: ImageSetRowMutation) => Promise<unknown>;
  transitionRow?: (id: string, from: ImageSetRowStatus[], data: ImageSetRowMutation, execution: ImageSetExecution) => Promise<boolean>;
  completeRow?: (id: string, data: Required<Pick<ImageSetRowMutation, "imageUrl" | "prompt" | "paramsJson">>, execution: ImageSetExecution) => Promise<boolean>;
  failUnfinishedRows?: (rows: Array<{ id: string; errorMessage: string }>, execution: ImageSetExecution) => Promise<unknown>;
  generateRole: (input: ImageSetRoleGenerationInput) => Promise<ImageSetRoleGenerationOutput>;
  saveBuffer: (buffer: Buffer, extension: string, prefix: string, signal?: AbortSignal) => Promise<string>;
  cleanupOrphanAsset?: (input: ImageSetOrphanAsset) => Promise<ImageSetOrphanCleanupResult>;
  loadAsDataUri?: (url: string, signal?: AbortSignal) => Promise<string>;
  setDeadlineTimer?: (callback: () => void, delayMs: number) => unknown;
  clearDeadlineTimer?: (timer: unknown) => void;
  createAbortController?: () => AbortController;
  waitForCleanupRetry?: (delayMs: number) => Promise<void>;
  now?: () => number;
  logError?: (...values: unknown[]) => void;
};

export type ImageSetBatchResult = {
  statuses: Partial<Record<ImageSetRole, "DONE" | "FAILED">>;
  params: Partial<Record<ImageSetRole, ImageSetRowParams>>;
};

export type ImageSetSuggestion = {
  role: ImageSetRole;
  label: string;
  path: "edit" | "text";
  cutout: boolean;
  sceneCn: string;
};

export type ImageSetOrphanAsset = {
  productId: string;
  libraryImageId: string;
  generationLeaseId: string;
  assetUrl: string;
};

export type ImageSetOrphanCleanupJob = ImageSetOrphanAsset & {
  id: string;
  attempts: number;
  lastError?: string | null;
  cleanupLeaseId?: string | null;
  cleanupLeaseExpiresAt?: Date | null;
};

export type ImageSetOrphanCleanupResult = { resolved: boolean; deleted: boolean };
export type ImageSetOrphanDeletionClaim = "claimed" | "safe_without_original_lease" | "blocked";

export type ImageSetOrphanCleanupDependencies = {
  upsertCleanupJob: (input: ImageSetOrphanAsset) => Promise<ImageSetOrphanCleanupJob>;
  claimCleanupJob: (job: ImageSetOrphanCleanupJob, execution: ImageSetExecution) => Promise<boolean>;
  claimOrphanDeletion: (input: ImageSetOrphanAsset) => Promise<ImageSetOrphanDeletionClaim>;
  isCurrentAsset: (job: ImageSetOrphanCleanupJob) => Promise<boolean>;
  deleteAsset: (url: string) => Promise<void>;
  completeCleanupJob: (job: ImageSetOrphanCleanupJob, execution: ImageSetExecution) => Promise<boolean>;
  recordCleanupFailure: (job: ImageSetOrphanCleanupJob, execution: ImageSetExecution, errorMessage: string) => Promise<unknown>;
  releaseCleanupJob: (job: ImageSetOrphanCleanupJob, execution: ImageSetExecution) => Promise<boolean>;
  createCleanupLease: () => ImageSetExecution;
  waitForRetry: (delayMs: number) => Promise<void>;
  logError: (...values: unknown[]) => void;
};

const orphanCleanupError = (error: unknown) => (
  error instanceof Error ? `Asset cleanup failed (${error.name})` : "Unknown asset cleanup failure"
);

const defaultOrphanCleanupDependencies: ImageSetOrphanCleanupDependencies = {
  upsertCleanupJob: async (input) => db.imageAssetCleanupJob.upsert({
    where: { assetUrl: input.assetUrl },
    create: input,
    update: {},
  }),
  claimCleanupJob: (job, execution) => claimImageAssetCleanupJobLease({
    jobId: job.id,
    leaseId: execution.leaseId,
    deadlineAt: execution.deadlineAt,
  }),
  claimOrphanDeletion: async (input) => {
    const claimed = await db.libraryImage.updateMany({
      where: {
        id: input.libraryImageId,
        OR: [
          { status: { in: ["PENDING", "GENERATING"] }, generationLeaseId: input.generationLeaseId },
          // Stale reconciliation may already have safely cleared the old lease.
          { status: "FAILED", generationLeaseId: null },
        ],
      },
      data: {
        status: "FAILED",
        errorMessage: "未完成的商品套圖素材已交由清理流程處理。",
        generationLeaseId: null,
        generationLeaseExpiresAt: null,
      },
    });
    if (claimed.count === 1) return "claimed";
    const current = await db.libraryImage.findUnique({
      where: { id: input.libraryImageId },
      select: { status: true, generationLeaseId: true, imageUrl: true },
    });
    if (!current) return "safe_without_original_lease";
    // A replacement generation lease cannot complete the old lease's result;
    // a DONE row, however, may already own the URL and must block deletion.
    if (["PENDING", "GENERATING"].includes(current.status) && current.generationLeaseId !== input.generationLeaseId) {
      return "safe_without_original_lease";
    }
    if (current.status === "DONE" && current.imageUrl !== input.assetUrl) {
      return "safe_without_original_lease";
    }
    return "blocked";
  },
  isCurrentAsset: async (job) => (await db.libraryImage.count({
    where: { status: "DONE", imageUrl: job.assetUrl },
  })) > 0,
  deleteAsset: deleteStoredAsset,
  completeCleanupJob: async (job, execution) => (await db.imageAssetCleanupJob.deleteMany({
    where: {
      id: job.id,
      assetUrl: job.assetUrl,
      libraryImageId: job.libraryImageId,
      generationLeaseId: job.generationLeaseId,
      cleanupLeaseId: execution.leaseId,
      cleanupLeaseExpiresAt: new Date(execution.deadlineAt),
    },
  })).count === 1,
  recordCleanupFailure: (job, execution, errorMessage) => db.imageAssetCleanupJob.updateMany({
    where: {
      id: job.id,
      assetUrl: job.assetUrl,
      libraryImageId: job.libraryImageId,
      generationLeaseId: job.generationLeaseId,
      cleanupLeaseId: execution.leaseId,
      cleanupLeaseExpiresAt: new Date(execution.deadlineAt),
    },
    data: { attempts: { increment: 1 }, lastError: errorMessage },
  }),
  releaseCleanupJob: async (job, execution) => (await db.imageAssetCleanupJob.updateMany({
    where: {
      id: job.id,
      cleanupLeaseId: execution.leaseId,
      cleanupLeaseExpiresAt: new Date(execution.deadlineAt),
    },
    data: { cleanupLeaseId: null, cleanupLeaseExpiresAt: null },
  })).count === 1,
  createCleanupLease: () => createImageSetExecution(Date.now(), randomUUID(), 15_000),
  waitForRetry: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  logError: (...values) => console.error(...values),
};

/** Records an orphan before deletion and retains the record when bounded cleanup cannot finish. */
export async function cleanupImageSetOrphanAsset(
  input: ImageSetOrphanAsset,
  dependencies: ImageSetOrphanCleanupDependencies = defaultOrphanCleanupDependencies,
): Promise<ImageSetOrphanCleanupResult> {
  const retryDelays = [0, 250, 1_000];
  let job: ImageSetOrphanCleanupJob | null = null;
  for (let attempt = 0; attempt < retryDelays.length && !job; attempt += 1) {
    if (attempt > 0) await dependencies.waitForRetry(retryDelays[attempt]);
    try {
      job = await dependencies.upsertCleanupJob(input);
    } catch (error) {
      dependencies.logError(`[image-set] orphan cleanup record attempt ${attempt + 1} failed`, orphanCleanupError(error));
    }
  }
  // The database tombstone is the normal coordination path. If the database is
  // unavailable, still make a bounded best-effort delete so a provider outage
  // does not turn every late upload into a permanent blob orphan. This path is
  // intentionally bounded and never reports success unless the provider delete
  // itself completed.
  if (!job) {
    let directDeletionClaimed = false;
    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (attempt > 0) await dependencies.waitForRetry(retryDelays[attempt]);
      try {
        if (!directDeletionClaimed) {
          const claim = await dependencies.claimOrphanDeletion(input);
          directDeletionClaimed = claim !== "blocked";
          if (!directDeletionClaimed) {
            dependencies.logError("[image-set] direct orphan delete skipped because the generation lease was not owned");
            return { resolved: false, deleted: false };
          }
        }
        // The row CAS above is the adoption barrier. Keep this check as a
        // second fail-closed guard for legacy paths that may have the same URL.
        const directFallbackJob: ImageSetOrphanCleanupJob = { id: "direct-fallback", ...input, attempts: 0 };
        if (await dependencies.isCurrentAsset(directFallbackJob)) {
          dependencies.logError("[image-set] direct orphan delete skipped because the asset is already current");
          return { resolved: false, deleted: false };
        }
        await dependencies.deleteAsset(input.assetUrl);
        return { resolved: true, deleted: true };
      } catch (error) {
        dependencies.logError(`[image-set] direct orphan delete attempt ${attempt + 1} failed`, orphanCleanupError(error));
      }
    }
    return { resolved: false, deleted: false };
  }
  const cleanupExecution = dependencies.createCleanupLease();
  if (!await dependencies.claimCleanupJob(job, cleanupExecution)) {
    return { resolved: false, deleted: false };
  }

  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (attempt > 0) await dependencies.waitForRetry(retryDelays[attempt]);
    try {
      if (await dependencies.isCurrentAsset(job)) {
        const resolved = await dependencies.completeCleanupJob(job, cleanupExecution);
        return { resolved, deleted: false };
      }
      await dependencies.deleteAsset(job.assetUrl);
      const resolved = await dependencies.completeCleanupJob(job, cleanupExecution);
      return { resolved, deleted: true };
    } catch (error) {
      const errorMessage = orphanCleanupError(error);
      try {
        await dependencies.recordCleanupFailure(job, cleanupExecution, errorMessage);
      } catch (recordError) {
        dependencies.logError("[image-set] orphan cleanup failure bookkeeping failed", recordError);
      }
      dependencies.logError(`[image-set] orphan asset delete attempt ${attempt + 1} failed`, errorMessage);
    }
  }
  await dependencies.releaseCleanupJob(job, cleanupExecution).catch((error) => {
    dependencies.logError("[image-set] orphan cleanup lease release failed; expiry will recover", orphanCleanupError(error));
  });
  return { resolved: false, deleted: false };
}

function extension(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

function roleFailureMessage(role: ImageSetRole, timedOut = false): string {
  const labels: Record<ImageSetRole, string> = {
    hero: "主視覺",
    detail: "細節素材",
    lifestyle: "使用情境",
    background: "情境背景",
    decoration: "品牌裝飾",
  };
  return timedOut
    ? `${labels[role]}生成逾時，可單獨重新產生；其他素材不受影響。`
    : `${labels[role]}生成失敗，可單獨重新產生；其他素材仍可繼續生成。`;
}

function isConcreteProvider(provider: string): boolean {
  const value = provider.trim();
  return !!value && !/(^|:)unreported(?:\+|$)/i.test(value);
}

function parseToneLabels(raw: string | null | undefined): string[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function asImageSetProduct(product: Pick<StoredImageSetProduct,
  "id" | "clientId" | "name" | "category" | "description" | "primaryColorOverride" | "rawImageUrls" | "heroImageUrl"
>): ImageSetProduct {
  return { ...product, rawImageUrls: parseRawImageUrls(product.rawImageUrls) };
}

function imageSetBrand(client: ImageSetClient, primaryColorOverride?: string | null) {
  return {
    primaryColor: primaryColorOverride || client?.primaryColor || undefined,
    toneLabels: parseToneLabels(client?.toneLabels),
  };
}

function suggestionsFor(profile: ProductVisualProfile, artDirection: ImageSetArtDirection): ImageSetSuggestion[] {
  const paletteDirection = [
    artDirection.palette.dominant.length ? `產品主色：${artDirection.palette.dominant.join("、")}` : "",
    artDirection.palette.accent.length ? `品牌輔色：${artDirection.palette.accent.join("、")}，僅作點綴，不作主色` : "",
  ].filter(Boolean).join("；");
  return planImageSetRoles(profile).map(({ role, label, path, cutout, sceneCn }) => ({
    role,
    label,
    path,
    cutout,
    sceneCn: [sceneCn, artDirection.concept && `視覺方向：${artDirection.concept}`, paletteDirection].filter(Boolean).join("；"),
  }));
}

function cachedProfileFor(product: StoredImageSetProduct): { profile: ProductVisualProfile | null; sourceHash: string } {
  const imageProduct = asImageSetProduct(product);
  const sourceHash = computeProductVisualSourceHash(imageProduct);
  try {
    const profile = parseProductVisualProfile(JSON.parse(product.visualProfileJson || "{}"));
    return { profile: profile && product.visualProfileSourceHash === sourceHash ? profile : null, sourceHash };
  } catch {
    return { profile: null, sourceHash };
  }
}

export type ImageSetAnalysisDependencies = {
  analyze: (product: ImageSetProduct, signal?: AbortSignal) => Promise<ProductVisualProfile>;
  persistProfile: (productId: string, data: {
    visualProfileJson: string;
    visualProfileSourceHash: string;
    visualProfileUpdatedAt: Date;
  }, execution: ImageSetExecution, checkedAt: Date) => Promise<boolean>;
  now?: () => Date;
};

const defaultAnalysisDependencies: ImageSetAnalysisDependencies = {
  analyze: (product, signal) => analyzeProductVisualProfile(product, {}, signal),
  persistProfile: async (productId, data, execution, checkedAt) => {
    void checkedAt;
    return persistProductVisualProfileWithLease({
      productId,
      leaseId: execution.leaseId,
      deadlineAt: execution.deadlineAt,
      ...data,
    });
  },
};

/** Builds the GET payload strictly from stored data. Dependency arguments are accepted
 * in tests to prove this path never invokes analysis or persistence. */
export async function readImageSetProduct(
  product: StoredImageSetProduct,
  client: ImageSetClient,
  dependencies?: Partial<ImageSetAnalysisDependencies>,
) {
  void dependencies;
  const { profile, sourceHash } = cachedProfileFor(product);
  const artDirection = profile ? buildImageSetArtDirection(profile, imageSetBrand(client, product.primaryColorOverride)) : null;
  const suggestionProfile = profile ?? fallbackProductVisualProfile(asImageSetProduct(product));
  const suggestionDirection = artDirection ?? buildImageSetArtDirection(suggestionProfile, imageSetBrand(client, product.primaryColorOverride));
  return {
    profile,
    artDirection,
    suggestions: suggestionsFor(suggestionProfile, suggestionDirection),
    needsAnalysis: !profile,
    hasHero: !!product.heroImageUrl,
    sourceImageCount: countProductVisualReferenceImages(asImageSetProduct(product)),
    sourceHash,
  };
}

export async function analyzeImageSetProduct(
  product: StoredImageSetProduct,
  client: ImageSetClient,
  force: boolean,
  dependencies: ImageSetAnalysisDependencies = defaultAnalysisDependencies,
  signal?: AbortSignal,
  execution?: ImageSetExecution,
) {
  const imageProduct = asImageSetProduct(product);
  const { profile: cachedProfile, sourceHash } = cachedProfileFor(product);
  const cached = !force && !!cachedProfile;
  const profile = cachedProfile && !force
    ? cachedProfile
    : await dependencies.analyze(imageProduct, signal);
  signal?.throwIfAborted();
  if (!cached) {
    if (!execution) throw new Error("Analysis persistence requires an active product lease");
    const checkedAt = (dependencies.now ?? (() => new Date()))();
    if (checkedAt.getTime() >= execution.deadlineAt) throw new Error("Analysis lease ownership was lost before persistence");
    const persisted = await dependencies.persistProfile(product.id, {
      visualProfileJson: JSON.stringify(profile),
      visualProfileSourceHash: sourceHash,
      visualProfileUpdatedAt: checkedAt,
    }, execution, checkedAt);
    if (!persisted) throw new Error("Analysis lease ownership was lost before persistence");
  }
  const artDirection = buildImageSetArtDirection(profile, imageSetBrand(client, product.primaryColorOverride));
  return {
    profile,
    artDirection,
    suggestions: suggestionsFor(profile, artDirection),
    cached,
    sourceHash,
  };
}

export const IMAGE_SET_FORCE_ANALYSIS_COOLDOWN_MS = 60_000;

export type RequestImageSetAnalysisDependencies<T> = {
  now: () => number;
  claimProductLease: (productId: string, execution: ImageSetExecution, kind: "analysis") => Promise<boolean>;
  releaseProductLease: (productId: string, leaseId: string) => Promise<unknown>;
  analyze: (signal?: AbortSignal) => Promise<T>;
};

export type RequestImageSetAnalysisResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 409 | 429; error: string };

/** Applies a durable product-wide paid-operation lease and force-analysis cooldown. */
export async function requestImageSetAnalysis<T>(
  request: {
    product: StoredImageSetProduct;
    client: ImageSetClient;
    force: boolean;
    execution: ImageSetExecution;
    signal?: AbortSignal;
  },
  dependencies: RequestImageSetAnalysisDependencies<T>,
): Promise<RequestImageSetAnalysisResult<T>> {
  const now = dependencies.now();
  if (
    request.force &&
    request.product.visualProfileUpdatedAt &&
    now - request.product.visualProfileUpdatedAt.getTime() < IMAGE_SET_FORCE_ANALYSIS_COOLDOWN_MS
  ) {
    return { ok: false, status: 429, error: "產品剛完成分析，請稍候一分鐘再強制重新分析。" };
  }
  if (request.execution.deadlineAt <= now || request.signal?.aborted) {
    return { ok: false, status: 409, error: "這次分析請求已逾時，請再試一次。" };
  }
  const claimed = await dependencies.claimProductLease(request.product.id, request.execution, "analysis");
  if (!claimed) return { ok: false, status: 409, error: "這項產品已有付費處理正在進行，請稍候再試。" };
  try {
    return { ok: true, value: await dependencies.analyze(request.signal) };
  } finally {
    await dependencies.releaseProductLease(request.product.id, request.execution.leaseId).catch(() => {});
  }
}

export function createImageSetRowParams(
  input: Pick<ImageSetBatchInput, "sourceHash" | "profile" | "artDirection">,
  roleSpec: ImageSetRoleSpec,
  provider?: string,
): ImageSetRowParams {
  return {
    imageSet: true,
    profileVersion: input.profile.version,
    sourceHash: input.sourceHash,
    artDirection: input.artDirection,
    roleSpec,
    ...(provider ? { provider } : {}),
  };
}

async function defaultLoadAsDataUri(url: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  let buffer: Buffer;
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma < 0) throw new Error("Invalid data URI");
    const metadata = url.slice(0, comma);
    const payload = url.slice(comma + 1);
    buffer = Buffer.from(metadata.includes(";base64") ? payload : decodeURIComponent(payload), metadata.includes(";base64") ? "base64" : "utf8");
  } else {
    buffer = Buffer.from(await loadBuffer(url, signal));
  }
  const png = await sharp(buffer)
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  signal?.throwIfAborted();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function loadReferenceDataUris(
  product: ImageSetProduct,
  batchHeroImageUrl: string | undefined,
  loadAsDataUri: (url: string, signal?: AbortSignal) => Promise<string>,
  signal?: AbortSignal,
): Promise<{ heroImageUrl?: string; rawImageUrls: string[]; batchHeroImageUrl?: string }> {
  const hero = product.heroImageUrl || undefined;
  const raw = [...new Set((product.rawImageUrls ?? []).filter(Boolean))].filter((url) => url !== hero);
  const urls = [...raw.slice(0, hero ? 4 : 5), ...(hero ? [hero] : [])];
  signal?.throwIfAborted();
  const settled = await Promise.allSettled(urls.map((url) => loadAsDataUri(url, signal)));
  signal?.throwIfAborted();
  const loaded = settled.flatMap((entry, index) => entry.status === "fulfilled" ? [{ url: urls[index], dataUri: entry.value }] : []);
  if (!loaded.length) {
    const failures = settled.flatMap((entry) => entry.status === "rejected" ? [entry.reason] : []);
    throw new AggregateError(failures, "No usable product reference image remains");
  }
  const heroDataUri = hero ? loaded.find((entry) => entry.url === hero)?.dataUri : undefined;
  let batchHeroDataUri: string | undefined;
  if (batchHeroImageUrl) {
    try {
      batchHeroDataUri = await loadAsDataUri(batchHeroImageUrl, signal);
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      // The generated hero is only a style anchor. Product identity references remain authoritative.
    }
  }
  return {
    rawImageUrls: loaded.map((entry) => entry.dataUri),
    ...(heroDataUri ? { heroImageUrl: heroDataUri } : {}),
    ...(batchHeroDataUri ? { batchHeroImageUrl: batchHeroDataUri } : {}),
  };
}

const defaultDependencies: ImageSetBatchDependencies = {
  transitionRow: async (id, from, data, execution) => {
    const result = await db.libraryImage.updateMany({ where: { id, status: { in: from }, generationLeaseId: execution.leaseId }, data });
    return result.count === 1;
  },
  completeRow: (id, data, execution) => completeGeneratedImageSetRowWithLease({
    rowId: id,
    leaseId: execution.leaseId,
    deadlineAt: execution.deadlineAt,
    imageUrl: data.imageUrl,
    prompt: data.prompt,
    paramsJson: data.paramsJson,
  }),
  failUnfinishedRows: (rows, execution) => db.$transaction(rows.map(({ id, errorMessage }) => db.libraryImage.updateMany({
    where: { id, status: { in: ["PENDING", "GENERATING"] }, generationLeaseId: execution.leaseId },
    data: { status: "FAILED", errorMessage, generationLeaseId: null, generationLeaseExpiresAt: null },
  }))),
  generateRole: generateImageSetRole,
  saveBuffer,
  cleanupOrphanAsset: cleanupImageSetOrphanAsset,
  loadAsDataUri: defaultLoadAsDataUri,
  setDeadlineTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearDeadlineTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  createAbortController: () => new AbortController(),
  waitForCleanupRetry: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  now: Date.now,
  logError: (...values) => console.error(...values),
};

/**
 * Generates one product image-set batch. Every row owns its own error boundary;
 * callers can await the function safely even if one or several image providers fail.
 */
export async function runImageSetBatch(
  input: ImageSetBatchInput,
  dependencies: ImageSetBatchDependencies = defaultDependencies,
  execution: ImageSetExecution = createImageSetExecution((dependencies.now ?? Date.now)(), `legacy_${input.batchId}`),
): Promise<ImageSetBatchResult> {
  const result: ImageSetBatchResult = { statuses: {}, params: {} };
  const loadAsDataUri = dependencies.loadAsDataUri ?? defaultLoadAsDataUri;
  const logError = dependencies.logError ?? defaultDependencies.logError!;
  const transitionRow = dependencies.transitionRow ?? (async (id, _from, data) => {
    if (!dependencies.updateRow) throw new Error("Missing row transition dependency");
    await dependencies.updateRow(id, data);
    return true;
  });
  const completeRow = dependencies.completeRow ?? (
    dependencies.transitionRow || dependencies.updateRow
      ? (id, data, value) => transitionRow(id, ["GENERATING"], {
        status: "DONE",
        ...data,
        errorMessage: null,
        generationLeaseId: null,
        generationLeaseExpiresAt: null,
      }, value)
      : defaultDependencies.completeRow!
  );
  const failUnfinishedRows = dependencies.failUnfinishedRows ?? (async (rows) => {
    if (!dependencies.updateRow) throw new Error("Missing unfinished-row dependency");
    await Promise.all(rows.map(({ id, errorMessage }) => dependencies.updateRow!(id, { status: "FAILED", errorMessage })));
  });
  const setDeadlineTimer = dependencies.setDeadlineTimer ?? defaultDependencies.setDeadlineTimer!;
  const clearDeadlineTimer = dependencies.clearDeadlineTimer ?? defaultDependencies.clearDeadlineTimer!;
  const cleanupOrphanAsset = dependencies.cleanupOrphanAsset ?? defaultDependencies.cleanupOrphanAsset!;
  const waitForCleanupRetry = dependencies.waitForCleanupRetry ?? defaultDependencies.waitForCleanupRetry!;
  const now = dependencies.now ?? Date.now;
  const abortController = (dependencies.createAbortController ?? defaultDependencies.createAbortController!)();
  const reachedDeadline = () => abortController.signal.aborted || now() >= execution.deadlineAt;

  const deleteOrphan = async (row: ImageSetRow, url: string) => {
    try {
      await cleanupOrphanAsset({
        productId: input.product.id,
        libraryImageId: row.id,
        generationLeaseId: execution.leaseId,
        assetUrl: url,
      });
    } catch (error) {
      logError("[image-set] orphan asset cleanup failed", error);
    }
  };

  const runRow = async (row: ImageSetRow, batchHeroImageUrl?: string): Promise<string | undefined> => {
    const initialParams = createImageSetRowParams(input, row.role);
    try {
      const claimed = await transitionRow(row.id, ["PENDING", "GENERATING"], {
        status: "GENERATING",
        errorMessage: null,
        paramsJson: JSON.stringify(initialParams),
        generationLeaseId: execution.leaseId,
        generationLeaseExpiresAt: new Date(execution.deadlineAt),
      }, execution);
      if (!claimed) {
        result.statuses[row.role.role] = "FAILED";
        result.params[row.role.role] = initialParams;
        return undefined;
      }
      if (reachedDeadline()) {
        await transitionRow(row.id, ["GENERATING"], {
          status: "FAILED",
          errorMessage: roleFailureMessage(row.role.role, true),
          paramsJson: JSON.stringify(initialParams),
          generationLeaseId: null,
          generationLeaseExpiresAt: null,
        }, execution).catch(() => {});
        result.statuses[row.role.role] = "FAILED";
        result.params[row.role.role] = initialParams;
        return undefined;
      }
      const references = row.role.path === "edit"
        ? await loadReferenceDataUris(input.product, batchHeroImageUrl, loadAsDataUri, abortController.signal)
        : { rawImageUrls: [] as string[] };
      const prompt = compileImageSetPrompt({
        product: { name: input.product.name, category: input.product.category },
        profile: input.profile,
        artDirection: input.artDirection,
        role: row.role,
      });
      abortController.signal.throwIfAborted();
      const generated = await dependencies.generateRole({
        role: row.role.role,
        prompt,
        heroImageUrl: references.heroImageUrl,
        rawImageUrls: references.rawImageUrls,
        batchHeroImageUrl: references.batchHeroImageUrl,
        aspectRatio: "1:1",
        signal: abortController.signal,
      });
      if (!isConcreteProvider(generated.provider)) throw new Error("Image provider trace is missing or synthetic");
      if (reachedDeadline()) throw new Error("Image-set batch deadline reached");
      const imageUrl = await dependencies.saveBuffer(
        generated.buffer,
        extension(generated.contentType),
        `product-set-${row.role.role}-`,
        abortController.signal,
      );
      const finalParams = createImageSetRowParams(input, row.role, generated.provider);
      if (reachedDeadline()) {
        await deleteOrphan(row, imageUrl);
        throw abortController.signal.reason ?? new Error("Image-set batch deadline reached");
      }
      const completed = !reachedDeadline() && await completeRow(row.id, {
        imageUrl,
        prompt,
        paramsJson: JSON.stringify(finalParams),
      }, execution);
      if (!completed) {
        await deleteOrphan(row, imageUrl);
        result.statuses[row.role.role] = "FAILED";
        result.params[row.role.role] = initialParams;
        return undefined;
      }
      result.statuses[row.role.role] = "DONE";
      result.params[row.role.role] = finalParams;
      return imageUrl;
    } catch (error) {
      logError(`[image-set:${row.role.role}] generation failed`, error);
      result.statuses[row.role.role] = "FAILED";
      result.params[row.role.role] = initialParams;
      await transitionRow(row.id, ["PENDING", "GENERATING"], {
        status: "FAILED",
        errorMessage: roleFailureMessage(row.role.role, reachedDeadline()),
        paramsJson: JSON.stringify(initialParams),
        generationLeaseId: null,
        generationLeaseExpiresAt: null,
      }, execution).catch(() => {});
      return undefined;
    }
  };

  let resolveDeadline!: () => void;
  const deadline = new Promise<void>((resolve) => { resolveDeadline = resolve; });
  let deadlineCleanupStarted = false;
  const finishAtDeadline = async () => {
    if (deadlineCleanupStarted) return deadline;
    deadlineCleanupStarted = true;
    if (!abortController.signal.aborted) abortController.abort(new Error("Image-set absolute deadline reached"));
    const unfinished = input.rows.filter((row) => result.statuses[row.role.role] !== "DONE");
    const cleanupRows = unfinished.map((row) => ({ id: row.id, errorMessage: roleFailureMessage(row.role.role, true) }));
    const retryDelays = [0, 1_000, 3_000];
    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (attempt > 0) await waitForCleanupRetry(retryDelays[attempt]);
      try {
        await failUnfinishedRows(cleanupRows, execution);
        break;
      } catch (error) {
        logError(`[image-set] deadline cleanup attempt ${attempt + 1} failed`, error);
      }
    }
    for (const row of unfinished) {
      result.statuses[row.role.role] = "FAILED";
      result.params[row.role.role] = createImageSetRowParams(input, row.role);
    }
    resolveDeadline();
  };
  const remainingMs = Math.max(0, execution.deadlineAt - now());
  const timer = remainingMs > 0
    ? setDeadlineTimer(() => { void finishAtDeadline(); }, remainingMs)
    : undefined;
  if (remainingMs === 0) void finishAtDeadline();

  const work = (async () => {
    const hero = input.rows.find((row) => row.role.role === "hero");
    const heroUrl = hero ? await runRow(hero) : undefined;
    const remaining = input.rows.filter((row) => row !== hero);

    // The hero is deliberately serialized. All other selected roles are independent
    // and are allowed to proceed even when hero generation did not produce an anchor.
    await Promise.all(remaining.map((row) => runRow(
      row,
      (row.role.role === "detail" || row.role.role === "lifestyle") ? heroUrl : undefined,
    )));
  })();

  const winner = await Promise.race([work.then(() => "work" as const), deadline.then(() => "deadline" as const)]);
  if (deadlineCleanupStarted) await deadline;
  else if (winner === "work" && timer !== undefined) clearDeadlineTimer(timer);
  return result;
}

export type ExpiredImageSetRow = {
  id: string;
  assetRole: ImageSetRole;
  generationLeaseId: string;
  generationLeaseExpiresAt: Date;
};

export type ReconcileStaleImageSetDependencies = {
  listExpiredRows: (productId: string, cutoff: Date) => Promise<ExpiredImageSetRow[]>;
  failExpiredRow: (row: ExpiredImageSetRow, cutoff: Date) => Promise<boolean>;
  releaseExpiredProductLease: (productId: string, cutoff: Date) => Promise<boolean>;
  listOrphanCleanupJobs: (productId: string) => Promise<ImageSetOrphanCleanupJob[]>;
  cleanupOrphanAsset: (job: ImageSetOrphanCleanupJob) => Promise<ImageSetOrphanCleanupResult>;
};

export type ReconcileImageSetCleanupDependencies = {
  listOrphanCleanupJobs: (limit: number) => Promise<ImageSetOrphanCleanupJob[]>;
  cleanupOrphanAsset: (job: ImageSetOrphanCleanupJob) => Promise<ImageSetOrphanCleanupResult>;
};

const imageSetRoles = new Set<ImageSetRole>(["hero", "detail", "lifestyle", "background", "decoration"]);

const defaultReconcileDependencies: ReconcileStaleImageSetDependencies = {
  listExpiredRows: async (productId, cutoff) => {
    const rows = await db.libraryImage.findMany({
      where: {
        productId,
        status: { in: ["PENDING", "GENERATING"] },
        generationLeaseId: { not: null },
        generationLeaseExpiresAt: { lte: cutoff },
      },
      select: { id: true, assetRole: true, generationLeaseId: true, generationLeaseExpiresAt: true },
    });
    return rows.flatMap((row) => (
      row.assetRole && imageSetRoles.has(row.assetRole as ImageSetRole) && row.generationLeaseId && row.generationLeaseExpiresAt
        ? [{ ...row, assetRole: row.assetRole as ImageSetRole, generationLeaseId: row.generationLeaseId, generationLeaseExpiresAt: row.generationLeaseExpiresAt }]
        : []
    ));
  },
  failExpiredRow: async (row, cutoff) => {
    const result = await db.libraryImage.updateMany({
      where: {
        id: row.id,
        status: { in: ["PENDING", "GENERATING"] },
        generationLeaseId: row.generationLeaseId,
        generationLeaseExpiresAt: { equals: row.generationLeaseExpiresAt, lte: cutoff },
      },
      data: {
        status: "FAILED",
        errorMessage: roleFailureMessage(row.assetRole, true),
        generationLeaseId: null,
        generationLeaseExpiresAt: null,
      },
    });
    return result.count === 1;
  },
  releaseExpiredProductLease: async (productId, cutoff) => {
    const result = await db.product.updateMany({
      where: { id: productId, paidOperationLeaseId: { not: null }, paidOperationLeaseExpiresAt: { lte: cutoff } },
      data: { paidOperationLeaseId: null, paidOperationLeaseExpiresAt: null, paidOperationKind: null },
    });
    return result.count === 1;
  },
  listOrphanCleanupJobs: (productId) => db.imageAssetCleanupJob.findMany({
    where: { productId },
    orderBy: { createdAt: "asc" },
  }),
  cleanupOrphanAsset: (job) => cleanupImageSetOrphanAsset(job),
};

const defaultCleanupReconcileDependencies: ReconcileImageSetCleanupDependencies = {
  // Cleanup jobs deliberately have no product FK, so this query remains useful
  // after a product or library row has been deleted. A bounded batch keeps a
  // request-triggered reconciler safe on serverless runtimes.
  listOrphanCleanupJobs: (limit) => db.imageAssetCleanupJob.findMany({
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 50)),
  }),
  cleanupOrphanAsset: (job) => cleanupImageSetOrphanAsset(job),
};

/** Drains durable cleanup tombstones globally, including jobs whose product was deleted. */
export async function reconcileImageSetCleanupJobs(
  limit = 25,
  dependencies: ReconcileImageSetCleanupDependencies = defaultCleanupReconcileDependencies,
): Promise<number> {
  const jobs = await dependencies.listOrphanCleanupJobs(limit);
  const results = await Promise.all(jobs.map((job) => dependencies.cleanupOrphanAsset(job)));
  return results.filter((result) => result.resolved).length;
}

/** Recovers work abandoned by a killed function. Every write is a status + lease + expiry CAS. */
export async function reconcileStaleImageSetWork(
  productId: string,
  cutoff: Date = new Date(),
  dependencies: ReconcileStaleImageSetDependencies = defaultReconcileDependencies,
): Promise<{ failedRows: number; releasedProductLease: boolean; cleanedAssets: number }> {
  const rows = await dependencies.listExpiredRows(productId, cutoff);
  const settled = await Promise.all(rows.map((row) => dependencies.failExpiredRow(row, cutoff)));
  const releasedProductLease = await dependencies.releaseExpiredProductLease(productId, cutoff);
  const cleanupJobs = await dependencies.listOrphanCleanupJobs(productId);
  const cleanupResults = await Promise.all(cleanupJobs.map((job) => dependencies.cleanupOrphanAsset(job)));
  return {
    failedRows: settled.filter(Boolean).length,
    releasedProductLease,
    cleanedAssets: cleanupResults.filter((result) => result.resolved).length,
  };
}

export type ImageSetPendingRowData = {
  clientId: string;
  productId: string;
  assetRole: ImageSetRole;
  subject: string;
  status: "PENDING";
  batchId: string;
  paramsJson: string;
  generationLeaseId: string;
  generationLeaseExpiresAt: Date;
};

export type CreateImageSetBatchDependencies = {
  createRows: (rows: ImageSetPendingRowData[]) => Promise<Array<{ id: string }>>;
  claimProductLease: (productId: string, execution: ImageSetExecution) => Promise<boolean>;
  releaseProductLease: (productId: string, leaseId: string) => Promise<unknown>;
  failCreatedRows?: (rowIds: string[], execution: ImageSetExecution) => Promise<boolean>;
  scheduleAfter: (callback: () => Promise<unknown>) => void;
  runBatch: (input: ImageSetBatchInput, execution: ImageSetExecution) => Promise<unknown>;
  createBatchId: () => string;
};

export type CreateImageSetBatchResult =
  | { ok: true; batchId: string; items: Array<{ id: string; role: ImageSetRole; label: string; status: "PENDING" }> }
  | { ok: false; status: 400 | 409; error: string };

/** Validates a confirmed analysis snapshot, creates the complete PENDING batch,
 * then registers one background callback without waiting for generation. */
export async function createAndScheduleImageSetBatch(
  request: {
    product: StoredImageSetProduct;
    client: ImageSetClient;
    selectedRoles: string[];
    requestSourceHash?: string;
    execution: ImageSetExecution;
  },
  dependencies: CreateImageSetBatchDependencies,
): Promise<CreateImageSetBatchResult> {
  const { product, client, selectedRoles, requestSourceHash, execution } = request;
  if (!selectedRoles.length) return { ok: false, status: 400, error: "未選擇任何套圖" };
  const { profile, sourceHash } = cachedProfileFor(product);
  if (!profile) return { ok: false, status: 409, error: "商品資料或圖片已更新，請先重新分析產品後再建立套圖。" };
  if (requestSourceHash && requestSourceHash !== sourceHash) {
    return { ok: false, status: 409, error: "商品分析已過期，請重新分析產品後再建立套圖。" };
  }

  const roleMap = new Map<ImageSetRole, ImageSetRoleSpec>(
    planImageSetRoles(profile).map((role) => [role.role, role]),
  );
  const roles = selectedRoles.map((role) => roleMap.get(role as ImageSetRole)).filter((role): role is ImageSetRoleSpec => !!role);
  if (roles.length !== selectedRoles.length) return { ok: false, status: 400, error: "套圖角色資料無效，請重新選擇。" };

  const imageProduct = asImageSetProduct(product);
  if (roles.some((role) => role.path === "edit") && ![...imageProduct.rawImageUrls, imageProduct.heroImageUrl].some(Boolean)) {
    return { ok: false, status: 400, error: "需要至少一張商品參考圖，才能生成主視覺、細節或使用情境。" };
  }

  const artDirection = buildImageSetArtDirection(profile, imageSetBrand(client, product.primaryColorOverride));
  const claimed = await dependencies.claimProductLease(product.id, execution);
  if (!claimed) return { ok: false, status: 409, error: "這項產品已有套圖正在生成，請等待完成後再試。" };
  const batchId = dependencies.createBatchId();
  const pendingRows: ImageSetPendingRowData[] = roles.map((role) => ({
    clientId: product.clientId,
    productId: product.id,
    assetRole: role.role,
    subject: role.label,
    status: "PENDING",
    batchId,
    paramsJson: JSON.stringify(createImageSetRowParams({ sourceHash, profile, artDirection }, role)),
    generationLeaseId: execution.leaseId,
    generationLeaseExpiresAt: new Date(execution.deadlineAt),
  }));
  let created: Array<{ id: string }>;
  try {
    created = await dependencies.createRows(pendingRows);
  } catch (error) {
    await dependencies.releaseProductLease(product.id, execution.leaseId).catch(() => {});
    throw error;
  }
  const batchInput: ImageSetBatchInput = {
    batchId,
    sourceHash,
    profile,
    artDirection,
    product: imageProduct,
    rows: created.map((row, index) => ({ id: row.id, role: roles[index] })),
  };
  try {
    dependencies.scheduleAfter(async () => {
      try {
        return await dependencies.runBatch(batchInput, execution);
      } finally {
        await dependencies.releaseProductLease(product.id, execution.leaseId).catch(() => {});
      }
    });
  } catch (error) {
    const cleaned = await dependencies.failCreatedRows?.(created.map((row) => row.id), execution).catch(() => false) ?? false;
    if (cleaned) await dependencies.releaseProductLease(product.id, execution.leaseId).catch(() => {});
    throw error;
  }
  return {
    ok: true,
    batchId,
    items: created.map((row, index) => ({
      id: row.id,
      role: roles[index].role,
      label: roles[index].label,
      status: "PENDING",
    })),
  };
}

export type PreparedImageSetRegeneration = {
  rowId: string;
  input: ImageSetBatchInput;
};

export type ImageSetRegenerationPreparation =
  | { ok: true; value: PreparedImageSetRegeneration }
  | { ok: false; status: 400 | 404 | 409; error: string };

export type ImageSetRegenerationRow = {
  id: string;
  batchId: string | null;
  paramsJson: string;
  product: StoredImageSetProduct | null;
};

function parseRawImageUrls(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((url): url is string => typeof url === "string" && !!url.trim()) : [];
  } catch {
    return [];
  }
}

function parseImageSetParams(raw: string): ImageSetRowParams | null {
  try {
    const value = JSON.parse(raw) as Partial<ImageSetRowParams>;
    if (!value || value.imageSet !== true || value.profileVersion !== 1 || typeof value.sourceHash !== "string") return null;
    if (!value.artDirection || !value.roleSpec || typeof value.roleSpec.role !== "string") return null;
    return value as ImageSetRowParams;
  } catch {
    return null;
  }
}

function isValidSavedRoleSpec(role: unknown): role is ImageSetRoleSpec {
  if (!role || typeof role !== "object") return false;
  const value = role as Partial<ImageSetRoleSpec>;
  return (
    typeof value.role === "string" &&
    typeof value.label === "string" &&
    (value.path === "edit" || value.path === "text") &&
    typeof value.cutout === "boolean" &&
    typeof value.sceneCn === "string" &&
    typeof value.objective === "string" &&
    typeof value.composition === "string" &&
    Array.isArray(value.mustNotShow) && value.mustNotShow.every((item) => typeof item === "string")
  );
}

export function prepareImageSetRegenerationFromRow(row: ImageSetRegenerationRow): ImageSetRegenerationPreparation {
  const params = parseImageSetParams(row.paramsJson);
  if (!params) return { ok: false, status: 400, error: "這不是可重新產生的商品套圖素材" };
  if (!row.product) return { ok: false, status: 400, error: "找不到這張素材所屬的產品" };

  const product = asImageSetProduct(row.product);
  const currentHash = computeProductVisualSourceHash(product);
  let profile: ProductVisualProfile | null = null;
  try {
    profile = parseProductVisualProfile(JSON.parse(row.product.visualProfileJson || "{}"));
  } catch {
    profile = null;
  }
  if (
    !profile ||
    row.product.visualProfileSourceHash !== currentHash ||
    params.sourceHash !== currentHash ||
    params.profileVersion !== profile.version
  ) {
    return { ok: false, status: 409, error: "商品資料或圖片已更新，請先重新分析產品後再重新產生這張素材。" };
  }

  const knownRole = planImageSetRoles(profile).some((role) => role.role === params.roleSpec.role);
  if (!knownRole || !isValidSavedRoleSpec(params.roleSpec)) {
    return { ok: false, status: 400, error: "商品套圖角色資料無效，請重新建立套圖。" };
  }

  return {
    ok: true,
    value: {
      rowId: row.id,
      input: {
        batchId: row.batchId ?? `retry_${row.id}`,
        sourceHash: params.sourceHash,
        profile,
        artDirection: params.artDirection,
        product,
        rows: [{ id: row.id, role: params.roleSpec }],
      },
    },
  };
}

/** Reloads and validates one saved image-set row before a single-role retry. */
export async function prepareImageSetRegeneration(rowId: string): Promise<ImageSetRegenerationPreparation> {
  const row = await db.libraryImage.findUnique({
    where: { id: rowId },
    include: { product: true },
  });
  if (!row) return { ok: false, status: 404, error: "找不到這張素材" };
  return prepareImageSetRegenerationFromRow(row);
}

/** Re-generates only the requested row; no sibling batch rows are read or mutated. */
export async function regenerateImageSetItem(
  rowId: string,
  alreadyPrepared?: PreparedImageSetRegeneration,
  execution?: ImageSetExecution,
): Promise<ImageSetBatchResult> {
  const prepared = alreadyPrepared ? { ok: true as const, value: alreadyPrepared } : await prepareImageSetRegeneration(rowId);
  if (!prepared.ok) throw new Error(prepared.error);
  return runImageSetBatch(prepared.value.input, defaultDependencies, execution);
}

export type RequestImageSetRegenerationDependencies = {
  prepare: (rowId: string) => Promise<ImageSetRegenerationPreparation>;
  claimFailedRow: (rowId: string, execution: ImageSetExecution) => Promise<boolean>;
  rollbackClaimedRow: (rowId: string, execution: ImageSetExecution) => Promise<boolean>;
  scheduleAfter: (callback: () => Promise<unknown>) => void;
  regenerate: (rowId: string, prepared: PreparedImageSetRegeneration, execution: ImageSetExecution) => Promise<unknown>;
  logError?: (...values: unknown[]) => void;
};

export type RequestImageSetRegenerationResult =
  | { ok: true; id: string; status: "GENERATING" }
  | { ok: false; status: 400 | 404 | 409; error: string };

/** Validates before any mutation, then schedules exactly one retry for the target row. */
export async function requestImageSetRegeneration(
  rowId: string,
  execution: ImageSetExecution,
  dependencies: RequestImageSetRegenerationDependencies,
): Promise<RequestImageSetRegenerationResult> {
  const prepared = await dependencies.prepare(rowId);
  if (!prepared.ok) return prepared;
  const claimed = await dependencies.claimFailedRow(rowId, execution);
  if (!claimed) {
    return { ok: false, status: 409, error: "這張素材目前無法重新產生，請確認狀態為失敗後再試一次。" };
  }
  try {
    dependencies.scheduleAfter(() => dependencies.regenerate(rowId, prepared.value, execution));
  } catch (error) {
    try {
      const rolledBack = await dependencies.rollbackClaimedRow(rowId, execution);
      if (!rolledBack) {
        dependencies.logError?.("[image-set:retry] immediate rollback lost lease ownership; stale reconciliation will recover", {
          rowId,
          leaseId: execution.leaseId,
        });
      }
    } catch (rollbackError) {
      dependencies.logError?.("[image-set:retry] immediate rollback failed; stale lease retained for reconciliation", {
        rowId,
        leaseId: execution.leaseId,
        error: rollbackError,
      });
    }
    throw error;
  }
  return { ok: true, id: rowId, status: "GENERATING" };
}
