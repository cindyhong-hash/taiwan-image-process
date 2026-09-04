import { createHash } from "node:crypto";

const PRODUCT_ARCHETYPES = [
  "beauty_device",
  "skincare",
  "cosmetics",
  "food_beverage",
  "fashion",
  "electronics",
  "home",
  "other",
] as const;

export type ProductArchetype = (typeof PRODUCT_ARCHETYPES)[number];

export type ProductVisualProfile = {
  version: 1;
  productType: string;
  productArchetype: ProductArchetype;
  confidence: number;
  appearance: {
    shape: string;
    materials: string[];
    colors: string[];
    distinctiveDetails: string[];
    visibleTextOrLogos: string[];
  };
  useCases: string[];
  suitableScenes: string[];
  visualMotifs: string[];
  prohibitedChanges: string[];
  sourceImageCount: number;
};

export type ProductVisualProfileInput = {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  rawImageUrls?: string[];
  heroImageUrl?: string | null;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isProductArchetype(value: unknown): value is ProductArchetype {
  return typeof value === "string" && (PRODUCT_ARCHETYPES as readonly string[]).includes(value);
}

function trim(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function parseProductVisualProfile(raw: unknown): ProductVisualProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const profile = raw as Record<string, unknown>;
  const appearance = profile.appearance;
  if (!appearance || typeof appearance !== "object" || Array.isArray(appearance)) return null;

  const visual = appearance as Record<string, unknown>;
  if (
    profile.version !== 1 ||
    typeof profile.productType !== "string" ||
    !isProductArchetype(profile.productArchetype) ||
    typeof profile.confidence !== "number" ||
    !Number.isFinite(profile.confidence) ||
    typeof visual.shape !== "string" ||
    !isStringArray(visual.materials) ||
    !isStringArray(visual.colors) ||
    !isStringArray(visual.distinctiveDetails) ||
    !isStringArray(visual.visibleTextOrLogos) ||
    !isStringArray(profile.useCases) ||
    !isStringArray(profile.suitableScenes) ||
    !isStringArray(profile.visualMotifs) ||
    !isStringArray(profile.prohibitedChanges) ||
    typeof profile.sourceImageCount !== "number" ||
    !Number.isFinite(profile.sourceImageCount) ||
    profile.sourceImageCount < 0
  ) {
    return null;
  }

  return {
    version: 1,
    productType: profile.productType,
    productArchetype: profile.productArchetype,
    confidence: Math.min(1, Math.max(0, profile.confidence)),
    appearance: {
      shape: visual.shape,
      materials: visual.materials,
      colors: visual.colors,
      distinctiveDetails: visual.distinctiveDetails,
      visibleTextOrLogos: visual.visibleTextOrLogos,
    },
    useCases: profile.useCases,
    suitableScenes: profile.suitableScenes,
    visualMotifs: profile.visualMotifs,
    prohibitedChanges: profile.prohibitedChanges,
    sourceImageCount: profile.sourceImageCount,
  };
}

function fallbackArchetype(category: string): ProductArchetype {
  if (category.includes("美容個護") || category.includes("美容儀器")) return "beauty_device";
  if (category.includes("保養")) return "skincare";
  if (category.includes("彩妝")) return "cosmetics";
  if (category.includes("食品") || category.includes("飲品") || category.includes("飲料")) return "food_beverage";
  if (category.includes("服飾") || category.includes("時尚")) return "fashion";
  if (category.includes("3C") || category.includes("電子")) return "electronics";
  if (category.includes("居家")) return "home";
  return "other";
}

export function fallbackProductVisualProfile(input: ProductVisualProfileInput): ProductVisualProfile {
  const category = trim(input.category);
  const rawImageUrls = input.rawImageUrls ?? [];

  return {
    version: 1,
    productType: category || trim(input.name),
    productArchetype: fallbackArchetype(category),
    confidence: 0,
    appearance: {
      shape: "",
      materials: [],
      colors: [],
      distinctiveDetails: [],
      visibleTextOrLogos: [],
    },
    useCases: [],
    suitableScenes: [],
    visualMotifs: [],
    prohibitedChanges: [],
    sourceImageCount: rawImageUrls.length + (trim(input.heroImageUrl) ? 1 : 0),
  };
}

export function computeProductVisualSourceHash(input: ProductVisualProfileInput): string {
  const rawImageUrls = (input.rawImageUrls ?? []).slice().sort();
  const source = JSON.stringify([
    trim(input.name),
    trim(input.description),
    trim(input.category),
    rawImageUrls,
    trim(input.heroImageUrl),
  ]);

  return createHash("sha256").update(source).digest("hex");
}
