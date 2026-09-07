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
): Promise<ImageSetRoleGenerationOutput> {
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
    ImageSetRoleGenerationOutput["provider"],
    (value: ReferenceGenerationInput) => Promise<ProviderImage>,
  ]> = [
    ["gpt", providers.gpt],
    ["seedream", providers.seedream],
    ["flux", providers.fluxEdit],
  ];
  for (const [provider, generate] of attempts) {
    input.signal?.throwIfAborted();
    try {
      const generated = await generate(referenceInput);
      return { ...generated, provider: generated.provider ?? provider };
    } catch (error) {
      if (input.signal?.aborted) throw input.signal.reason ?? new DOMException("Aborted", "AbortError");
      console.warn(
        `[image-set:${input.role}] ${provider} attempt failed`,
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }
  throw new Error(`${input.role} 生成失敗：所有圖片服務皆無法完成`);
}
