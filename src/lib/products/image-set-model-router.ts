import {
  falImageGenerateWithReferences,
  falRemoveBg,
  generateImage,
  gptImageGenerateWithReferences,
} from "../generate.ts";
import type { ImageSetRole } from "./image-set-roles.ts";

export type ProviderImage = {
  buffer: Buffer;
  contentType: string;
  provider?: string;
};

export type ReferenceGenerationInput = {
  prompt: string;
  imageDataUris: string[];
  batchHeroImageUrl?: string;
  aspectRatio?: string;
  signal?: AbortSignal;
};

export type ImageSetRoleGenerationInput = {
  role: ImageSetRole;
  prompt: string;
  heroImageUrl?: string | null;
  rawImageUrls?: string[];
  batchHeroImageUrl?: string | null;
  aspectRatio?: string;
  signal?: AbortSignal;
  deadlineAt?: number;
};

export type ImageSetRoleGenerationOutput = ProviderImage & {
  provider: string;
};

export type ImageSetRoleProviders = {
  gpt: (input: ReferenceGenerationInput) => Promise<ProviderImage>;
  seedream: (input: ReferenceGenerationInput) => Promise<ProviderImage>;
  fluxEdit: (input: ReferenceGenerationInput) => Promise<ProviderImage>;
  textImage: (input: ReferenceGenerationInput) => Promise<ProviderImage>;
  removeBg: (imageDataUri: string, signal?: AbortSignal) => Promise<Buffer>;
};

type RouterTiming = {
  now?: () => number;
  timeoutSignal?: (milliseconds: number) => AbortSignal;
};

export class ImageSetFallbackBudgetError extends Error {
  readonly code = "IMAGE_SET_FALLBACK_BUDGET_EXHAUSTED";

  constructor() {
    super("Image-set fallback time budget exhausted");
    this.name = "ImageSetFallbackBudgetError";
  }
}

const ATTEMPT_BUDGETS_MS = {
  gpt: { minimum: 90_000, maximum: 90_000 },
  seedream: { minimum: 90_000, maximum: 150_000 },
  flux: { minimum: 60_000, maximum: 90_000 },
} as const;
const CLEANUP_RESERVE_MS = 30_000;

function attemptSignal(
  input: ImageSetRoleGenerationInput,
  provider: keyof typeof ATTEMPT_BUDGETS_MS,
  timing: Required<RouterTiming>,
): AbortSignal | undefined {
  if (!input.deadlineAt) return input.signal;

  const remainingMs = input.deadlineAt - timing.now();
  const laterProviders = provider === "gpt"
    ? ATTEMPT_BUDGETS_MS.seedream.minimum + ATTEMPT_BUDGETS_MS.flux.minimum
    : provider === "seedream"
      ? ATTEMPT_BUDGETS_MS.flux.minimum
      : 0;
  const budgetMs = Math.min(
    ATTEMPT_BUDGETS_MS[provider].maximum,
    remainingMs - laterProviders - CLEANUP_RESERVE_MS,
  );
  if (budgetMs < ATTEMPT_BUDGETS_MS[provider].minimum) throw new ImageSetFallbackBudgetError();
  const budgetSignal = timing.timeoutSignal(budgetMs);
  return input.signal ? AbortSignal.any([input.signal, budgetSignal]) : budgetSignal;
}

function collectReferences(input: ImageSetRoleGenerationInput): Pick<ReferenceGenerationInput, "imageDataUris" | "batchHeroImageUrl"> {
  const hero = input.heroImageUrl || undefined;
  const batchHero = input.batchHeroImageUrl && input.batchHeroImageUrl !== hero
    ? input.batchHeroImageUrl
    : undefined;
  const rawReferences = [...new Set((input.rawImageUrls ?? []).filter(Boolean))]
    .filter((url) => url !== hero && url !== batchHero);
  const productLimit = batchHero ? 4 : 5;
  const productReferences = [
    ...rawReferences.slice(0, Math.max(0, productLimit - (hero ? 1 : 0))),
    ...(hero ? [hero] : []),
  ];
  return { imageDataUris: productReferences, ...(batchHero ? { batchHeroImageUrl: batchHero } : {}) };
}

const defaultProviders: ImageSetRoleProviders = {
  gpt: gptImageGenerateWithReferences,
  seedream: (input) => falImageGenerateWithReferences({
    prompt: input.prompt,
    imageDataUris: input.imageDataUris,
    batchHeroImageUrl: input.batchHeroImageUrl,
    aspectRatio: input.aspectRatio,
    provider: "seedream",
    signal: input.signal,
  }),
  fluxEdit: (input) => falImageGenerateWithReferences({
    prompt: input.prompt,
    imageDataUris: input.imageDataUris,
    batchHeroImageUrl: input.batchHeroImageUrl,
    aspectRatio: input.aspectRatio,
    provider: "flux",
    signal: input.signal,
  }),
  textImage: (input) => generateImage({
    prompt: input.prompt,
    width: input.aspectRatio === "3:2" ? 1536 : 1024,
    height: input.aspectRatio === "3:2" ? 1024 : 1024,
    model: "flux-2-pro",
    signal: input.signal,
  }),
  removeBg: falRemoveBg,
};

function imageToDataUri(image: ProviderImage): string {
  return `data:${image.contentType || "image/png"};base64,${image.buffer.toString("base64")}`;
}

export async function generateImageSetRole(
  input: ImageSetRoleGenerationInput,
  providers: ImageSetRoleProviders = defaultProviders,
  timingOverrides: RouterTiming = {},
): Promise<ImageSetRoleGenerationOutput> {
  const timing: Required<RouterTiming> = {
    now: timingOverrides.now ?? Date.now,
    timeoutSignal: timingOverrides.timeoutSignal ?? AbortSignal.timeout,
  };
  const base = {
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    imageDataUris: [] as string[],
    signal: input.signal,
  };

  input.signal?.throwIfAborted();

  if (input.role === "background") {
    const generated = await providers.textImage(base);
    return { ...generated, provider: generated.provider ?? "text:unreported" };
  }

  if (input.role === "decoration") {
    const generated = await providers.textImage(base);
    try {
      input.signal?.throwIfAborted();
      const buffer = await providers.removeBg(imageToDataUri(generated), input.signal);
      return {
        buffer,
        contentType: "image/png",
        provider: `${generated.provider ?? "text:unreported"}+rembg`,
      };
    } catch {
      throw new Error("裝飾元素去背失敗，請單獨重試");
    }
  }

  const referenceInput = { ...base, ...collectReferences(input) };
  if (!referenceInput.imageDataUris.length) {
    throw new Error(`${input.role} 生成失敗：缺少商品參考圖`);
  }
  const attempts: Array<[
    keyof typeof ATTEMPT_BUDGETS_MS,
    ImageSetRoleGenerationOutput["provider"],
    (value: ReferenceGenerationInput) => Promise<ProviderImage>,
  ]> = [
    ["gpt", "gpt", providers.gpt],
    ["seedream", "seedream", providers.seedream],
    ["flux", "flux", providers.fluxEdit],
  ];
  let attemptedProvider = false;
  let skippedForBudget = false;
  for (const [providerKey, provider, generate] of attempts) {
    input.signal?.throwIfAborted();
    let signal: AbortSignal | undefined;
    try {
      signal = attemptSignal(input, providerKey, timing);
    } catch (error) {
      if (error instanceof ImageSetFallbackBudgetError) {
        skippedForBudget = true;
        console.warn(`[image-set:${input.role}] ${provider} skipped because the remaining batch time is insufficient`);
        continue;
      }
      throw error;
    }
    try {
      attemptedProvider = true;
      const generated = await generate({ ...referenceInput, signal });
      return { ...generated, provider: generated.provider ?? provider };
    } catch (error) {
      if (error instanceof ImageSetFallbackBudgetError) throw error;
      if (input.signal?.aborted) throw input.signal.reason ?? new DOMException("Aborted", "AbortError");
      console.warn(
        `[image-set:${input.role}] ${provider} attempt failed`,
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }
  if (!attemptedProvider && skippedForBudget) throw new ImageSetFallbackBudgetError();
  throw new Error(`${input.role} 生成失敗：所有圖片服務皆無法完成`);
}
