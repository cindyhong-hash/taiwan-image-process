import sharp from "sharp";
import { db } from "../db.ts";
import { loadBuffer, saveBuffer } from "../storage.ts";
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

type ImageSetRowMutation = {
  status?: ImageSetRowStatus;
  imageUrl?: string;
  prompt?: string;
  paramsJson?: string;
  errorMessage?: string | null;
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
  transitionRow?: (id: string, from: ImageSetRowStatus[], data: ImageSetRowMutation) => Promise<boolean>;
  failUnfinishedRows?: (rows: Array<{ id: string; errorMessage: string }>) => Promise<unknown>;
  generateRole: (input: ImageSetRoleGenerationInput) => Promise<ImageSetRoleGenerationOutput>;
  saveBuffer: (buffer: Buffer, extension: string, prefix: string) => Promise<string>;
  loadAsDataUri?: (url: string) => Promise<string>;
  setDeadlineTimer?: (callback: () => void, delayMs: number) => unknown;
  clearDeadlineTimer?: (timer: unknown) => void;
  deadlineMs?: number;
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
  analyze: typeof analyzeProductVisualProfile;
  persistProfile: (productId: string, data: {
    visualProfileJson: string;
    visualProfileSourceHash: string;
    visualProfileUpdatedAt: Date;
  }) => Promise<unknown>;
};

const defaultAnalysisDependencies: ImageSetAnalysisDependencies = {
  analyze: analyzeProductVisualProfile,
  persistProfile: (productId, data) => db.product.update({ where: { id: productId }, data }),
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
) {
  const imageProduct = asImageSetProduct(product);
  const { profile: cachedProfile, sourceHash } = cachedProfileFor(product);
  const cached = !force && !!cachedProfile;
  const profile = cachedProfile && !force
    ? cachedProfile
    : await dependencies.analyze(imageProduct);
  if (!cached) {
    await dependencies.persistProfile(product.id, {
      visualProfileJson: JSON.stringify(profile),
      visualProfileSourceHash: sourceHash,
      visualProfileUpdatedAt: new Date(),
    });
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

async function defaultLoadAsDataUri(url: string): Promise<string> {
  let buffer: Buffer;
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma < 0) throw new Error("Invalid data URI");
    const metadata = url.slice(0, comma);
    const payload = url.slice(comma + 1);
    buffer = Buffer.from(metadata.includes(";base64") ? payload : decodeURIComponent(payload), metadata.includes(";base64") ? "base64" : "utf8");
  } else {
    buffer = Buffer.from(await loadBuffer(url));
  }
  const png = await sharp(buffer)
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function loadReferenceDataUris(
  product: ImageSetProduct,
  batchHeroImageUrl: string | undefined,
  loadAsDataUri: (url: string) => Promise<string>,
): Promise<{ heroImageUrl?: string; rawImageUrls: string[]; batchHeroImageUrl?: string }> {
  const hero = product.heroImageUrl || undefined;
  const raw = [...new Set((product.rawImageUrls ?? []).filter(Boolean))].filter((url) => url !== hero);
  const urls = [...raw.slice(0, hero ? 4 : 5), ...(hero ? [hero] : [])];
  const settled = await Promise.allSettled(urls.map(loadAsDataUri));
  const loaded = settled.flatMap((entry, index) => entry.status === "fulfilled" ? [{ url: urls[index], dataUri: entry.value }] : []);
  if (!loaded.length) {
    const failures = settled.flatMap((entry) => entry.status === "rejected" ? [entry.reason] : []);
    throw new AggregateError(failures, "No usable product reference image remains");
  }
  const heroDataUri = hero ? loaded.find((entry) => entry.url === hero)?.dataUri : undefined;
  let batchHeroDataUri: string | undefined;
  if (batchHeroImageUrl) {
    try {
      batchHeroDataUri = await loadAsDataUri(batchHeroImageUrl);
    } catch {
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
  transitionRow: async (id, from, data) => {
    const result = await db.libraryImage.updateMany({ where: { id, status: { in: from } }, data });
    return result.count === 1;
  },
  failUnfinishedRows: (rows) => db.$transaction(rows.map(({ id, errorMessage }) => db.libraryImage.updateMany({
    where: { id, status: { in: ["PENDING", "GENERATING"] } },
    data: { status: "FAILED", errorMessage },
  }))),
  generateRole: generateImageSetRole,
  saveBuffer,
  loadAsDataUri: defaultLoadAsDataUri,
  setDeadlineTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearDeadlineTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  deadlineMs: IMAGE_SET_BATCH_DEADLINE_MS,
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
): Promise<ImageSetBatchResult> {
  const result: ImageSetBatchResult = { statuses: {}, params: {} };
  const loadAsDataUri = dependencies.loadAsDataUri ?? defaultLoadAsDataUri;
  const logError = dependencies.logError ?? defaultDependencies.logError!;
  const transitionRow = dependencies.transitionRow ?? (async (id, _from, data) => {
    if (!dependencies.updateRow) throw new Error("Missing row transition dependency");
    await dependencies.updateRow(id, data);
    return true;
  });
  const failUnfinishedRows = dependencies.failUnfinishedRows ?? (async (rows) => {
    if (!dependencies.updateRow) throw new Error("Missing unfinished-row dependency");
    await Promise.all(rows.map(({ id, errorMessage }) => dependencies.updateRow!(id, { status: "FAILED", errorMessage })));
  });
  const setDeadlineTimer = dependencies.setDeadlineTimer ?? defaultDependencies.setDeadlineTimer!;
  const clearDeadlineTimer = dependencies.clearDeadlineTimer ?? defaultDependencies.clearDeadlineTimer!;
  const deadlineMs = dependencies.deadlineMs ?? IMAGE_SET_BATCH_DEADLINE_MS;
  const now = dependencies.now ?? Date.now;
  const deadlineAt = now() + deadlineMs;
  let deadlineReached = false;
  const reachedDeadline = () => deadlineReached || now() >= deadlineAt;

  const runRow = async (row: ImageSetRow, batchHeroImageUrl?: string): Promise<string | undefined> => {
    const initialParams = createImageSetRowParams(input, row.role);
    try {
      const claimed = await transitionRow(row.id, ["PENDING", "GENERATING"], {
        status: "GENERATING",
        errorMessage: null,
        paramsJson: JSON.stringify(initialParams),
      });
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
        }).catch(() => {});
        result.statuses[row.role.role] = "FAILED";
        result.params[row.role.role] = initialParams;
        return undefined;
      }
      const references = row.role.path === "edit"
        ? await loadReferenceDataUris(input.product, batchHeroImageUrl, loadAsDataUri)
        : { rawImageUrls: [] as string[] };
      const prompt = compileImageSetPrompt({
        product: { name: input.product.name, category: input.product.category },
        profile: input.profile,
        artDirection: input.artDirection,
        role: row.role,
      });
      const generated = await dependencies.generateRole({
        role: row.role.role,
        prompt,
        heroImageUrl: references.heroImageUrl,
        rawImageUrls: references.rawImageUrls,
        batchHeroImageUrl: references.batchHeroImageUrl,
        aspectRatio: "1:1",
      });
      if (!isConcreteProvider(generated.provider)) throw new Error("Image provider trace is missing or synthetic");
      if (reachedDeadline()) throw new Error("Image-set batch deadline reached");
      const imageUrl = await dependencies.saveBuffer(generated.buffer, extension(generated.contentType), `product-set-${row.role.role}-`);
      const finalParams = createImageSetRowParams(input, row.role, generated.provider);
      const completed = !reachedDeadline() && await transitionRow(row.id, ["GENERATING"], {
        status: "DONE",
        imageUrl,
        prompt,
        paramsJson: JSON.stringify(finalParams),
        errorMessage: null,
      });
      if (!completed) {
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
      }).catch(() => {});
      return undefined;
    }
  };

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

  let resolveDeadline!: () => void;
  const deadline = new Promise<void>((resolve) => { resolveDeadline = resolve; });
  const timer = setDeadlineTimer(() => {
    void (async () => {
      deadlineReached = true;
      const unfinished = input.rows.filter((row) => result.statuses[row.role.role] !== "DONE");
      await failUnfinishedRows(unfinished.map((row) => ({ id: row.id, errorMessage: roleFailureMessage(row.role.role, true) })));
      for (const row of unfinished) {
        result.statuses[row.role.role] = "FAILED";
        result.params[row.role.role] = createImageSetRowParams(input, row.role);
      }
      resolveDeadline();
    })().catch((error) => {
      logError("[image-set] deadline cleanup failed", error);
      resolveDeadline();
    });
  }, deadlineMs);
  const winner = await Promise.race([work.then(() => "work" as const), deadline.then(() => "deadline" as const)]);
  if (winner === "work") clearDeadlineTimer(timer);
  return result;
}

export type ImageSetPendingRowData = {
  clientId: string;
  productId: string;
  assetRole: ImageSetRole;
  subject: string;
  status: "PENDING";
  batchId: string;
  paramsJson: string;
};

export type CreateImageSetBatchDependencies = {
  createRows: (rows: ImageSetPendingRowData[]) => Promise<Array<{ id: string }>>;
  scheduleAfter: (callback: () => Promise<unknown>) => void;
  runBatch: (input: ImageSetBatchInput) => Promise<unknown>;
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
  },
  dependencies: CreateImageSetBatchDependencies,
): Promise<CreateImageSetBatchResult> {
  const { product, client, selectedRoles, requestSourceHash } = request;
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
  const batchId = dependencies.createBatchId();
  const pendingRows: ImageSetPendingRowData[] = roles.map((role) => ({
    clientId: product.clientId,
    productId: product.id,
    assetRole: role.role,
    subject: role.label,
    status: "PENDING",
    batchId,
    paramsJson: JSON.stringify(createImageSetRowParams({ sourceHash, profile, artDirection }, role)),
  }));
  const created = await dependencies.createRows(pendingRows);
  const batchInput: ImageSetBatchInput = {
    batchId,
    sourceHash,
    profile,
    artDirection,
    product: imageProduct,
    rows: created.map((row, index) => ({ id: row.id, role: roles[index] })),
  };
  dependencies.scheduleAfter(() => dependencies.runBatch(batchInput));
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
): Promise<ImageSetBatchResult> {
  const prepared = alreadyPrepared ? { ok: true as const, value: alreadyPrepared } : await prepareImageSetRegeneration(rowId);
  if (!prepared.ok) throw new Error(prepared.error);
  return runImageSetBatch(prepared.value.input);
}

export type RequestImageSetRegenerationDependencies = {
  prepare: (rowId: string) => Promise<ImageSetRegenerationPreparation>;
  claimFailedRow: (rowId: string) => Promise<boolean>;
  scheduleAfter: (callback: () => Promise<unknown>) => void;
  regenerate: (rowId: string, prepared: PreparedImageSetRegeneration) => Promise<unknown>;
};

export type RequestImageSetRegenerationResult =
  | { ok: true; id: string; status: "GENERATING" }
  | { ok: false; status: 400 | 404 | 409; error: string };

/** Validates before any mutation, then schedules exactly one retry for the target row. */
export async function requestImageSetRegeneration(
  rowId: string,
  dependencies: RequestImageSetRegenerationDependencies,
): Promise<RequestImageSetRegenerationResult> {
  const prepared = await dependencies.prepare(rowId);
  if (!prepared.ok) return prepared;
  const claimed = await dependencies.claimFailedRow(rowId);
  if (!claimed) {
    return { ok: false, status: 409, error: "這張素材目前無法重新產生，請確認狀態為失敗後再試一次。" };
  }
  dependencies.scheduleAfter(() => dependencies.regenerate(rowId, prepared.value));
  return { ok: true, id: rowId, status: "GENERATING" };
}
