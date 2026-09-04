import {
  falFlux2Edit,
  falRemoveBg,
  falSeedreamEdit,
  generateImage,
  gptImageGenerateWithReferences,
} from "../generate.ts";
import type { ImageSetRole } from "./image-set-roles.ts";

export type ProviderImage = {
  buffer: Buffer;
  contentType: string;
};

export type ReferenceGenerationInput = {
  prompt: string;
  imageDataUris: string[];
  aspectRatio?: string;
};

export type ImageSetRoleGenerationInput = {
  role: ImageSetRole;
  prompt: string;
  heroImageUrl?: string | null;
  rawImageUrls?: string[];
  batchHeroImageUrl?: string | null;
  aspectRatio?: string;
};

export type ImageSetRoleGenerationOutput = ProviderImage & {
  provider: "gpt" | "seedream" | "flux" | "text" | "text+rembg";
};

export type ImageSetRoleProviders = {
  gpt: (input: ReferenceGenerationInput) => Promise<ProviderImage>;
  seedream: (input: ReferenceGenerationInput) => Promise<ProviderImage>;
  fluxEdit: (input: ReferenceGenerationInput) => Promise<ProviderImage>;
  textImage: (input: ReferenceGenerationInput) => Promise<ProviderImage>;
  removeBg: (imageDataUri: string) => Promise<Buffer>;
};

function collectReferences(input: ImageSetRoleGenerationInput): string[] {
  const protectedReferences = [...new Set([
    input.batchHeroImageUrl,
    input.heroImageUrl,
  ].filter((url): url is string => Boolean(url)))].slice(-2);
  const rawReferences = [...new Set((input.rawImageUrls ?? []).filter(Boolean))]
    .filter((url) => !protectedReferences.includes(url));
  return [
    ...rawReferences.slice(0, Math.max(0, 5 - protectedReferences.length)),
    ...protectedReferences,
  ];
}

const defaultProviders: ImageSetRoleProviders = {
  gpt: gptImageGenerateWithReferences,
  seedream: (input) => falSeedreamEdit({
    productDataUris: input.imageDataUris,
    sceneDescription: input.prompt,
    aspectRatio: input.aspectRatio,
  }),
  fluxEdit: (input) => falFlux2Edit({
    productDataUris: input.imageDataUris,
    sceneDescription: input.prompt,
    aspectRatio: input.aspectRatio,
  }),
  textImage: (input) => generateImage({
    prompt: input.prompt,
    width: input.aspectRatio === "3:2" ? 1536 : 1024,
    height: input.aspectRatio === "3:2" ? 1024 : 1024,
    model: "flux-2-pro",
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
  };

  if (input.role === "background") {
    const generated = await providers.textImage(base);
    return { ...generated, provider: "text" };
  }

  if (input.role === "decoration") {
    const generated = await providers.textImage(base);
    try {
      const buffer = await providers.removeBg(imageToDataUri(generated));
      return { buffer, contentType: "image/png", provider: "text+rembg" };
    } catch {
      throw new Error("裝飾元素去背失敗，請單獨重試");
    }
  }

  const referenceInput = { ...base, imageDataUris: collectReferences(input) };
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
    try {
      return { ...await generate(referenceInput), provider };
    } catch (error) {
      console.warn(
        `[image-set:${input.role}] ${provider} attempt failed`,
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }
  throw new Error(`${input.role} 生成失敗：所有圖片服務皆無法完成`);
}
