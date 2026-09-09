import { parseProductVisualProfile, type ProductVisualProfile } from "../products/product-visual-profile.ts";

export type AdVisualKitRole = "hero" | "detail" | "background" | "benefit" | "decoration";

export type AdAssetCandidate = {
  role: AdVisualKitRole | "logo";
  imageUrl: string;
  identityCritical: boolean;
  sourceRole: string;
};

export type AdAssetInventory = {
  byRole: Partial<Record<AdVisualKitRole, AdAssetCandidate>>;
  logo?: AdAssetCandidate;
};

type PersistedAsset = { assetRole: string | null; imageUrl: string | null };

export type AdLayoutContextInput = {
  product: {
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    heroImageUrl?: string | null;
    visualProfileJson?: string | null;
    primaryColorOverride?: string | null;
  };
  client?: {
    name?: string | null;
    description?: string | null;
    industry?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    toneLabels?: unknown;
    paletteColors?: unknown;
    logoUrls?: unknown;
  } | null;
  assets: PersistedAsset[];
};

export type AdLayoutContext = {
  product: {
    id: string;
    name: string;
    description?: string;
    category?: string;
    profile: ProductVisualProfile | null;
  };
  brand: {
    name?: string;
    description?: string;
    industry?: string;
    primaryColor: string;
    secondaryColor?: string;
    tones: string[];
    palette: string[];
  };
  inventory: AdAssetInventory;
};

const ROLE_ALIASES: Record<string, AdVisualKitRole> = {
  hero: "hero",
  product: "hero",
  detail: "detail",
  texture: "detail",
  background: "background",
  benefit: "benefit",
  lifestyle: "benefit",
  ingredient: "benefit",
  decoration: "decoration",
};

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()) : [];
  } catch {
    return [];
  }
}

function firstString(value: unknown): string | undefined {
  return stringList(value)[0];
}

function canonicalRole(role: string | null): AdVisualKitRole | undefined {
  return role ? ROLE_ALIASES[role] : undefined;
}

function parseProfile(value: string | null | undefined): ProductVisualProfile | null {
  if (!value?.trim()) return null;
  try {
    return parseProductVisualProfile(JSON.parse(value));
  } catch {
    return null;
  }
}

export function inventoryFromAssets(input: {
  heroImageUrl?: string | null;
  assets: PersistedAsset[];
  logoUrl?: string;
}): AdAssetInventory {
  const byRole: AdAssetInventory["byRole"] = {};

  for (const asset of input.assets) {
    const role = canonicalRole(asset.assetRole);
    const imageUrl = asset.imageUrl?.trim();
    if (!role || !imageUrl || byRole[role]) continue;
    byRole[role] = { role, imageUrl, identityCritical: role === "hero", sourceRole: asset.assetRole ?? role };
  }

  const heroImageUrl = input.heroImageUrl?.trim();
  if (heroImageUrl) {
    byRole.hero = { role: "hero", imageUrl: heroImageUrl, identityCritical: true, sourceRole: "product.heroImageUrl" };
  }

  return {
    byRole,
    logo: input.logoUrl?.trim()
      ? { role: "logo", imageUrl: input.logoUrl.trim(), identityCritical: true, sourceRole: "client.logoUrls" }
      : undefined,
  };
}

export function createAdLayoutContext(input: AdLayoutContextInput): AdLayoutContext {
  const client = input.client;
  const primaryColor = input.product.primaryColorOverride?.trim() || client?.primaryColor?.trim() || "#6d4aff";
  const logoUrl = firstString(client?.logoUrls);
  return {
    product: {
      id: input.product.id,
      name: input.product.name.trim(),
      description: input.product.description?.trim() || undefined,
      category: input.product.category?.trim() || undefined,
      profile: parseProfile(input.product.visualProfileJson),
    },
    brand: {
      name: client?.name?.trim() || undefined,
      description: client?.description?.trim() || undefined,
      industry: client?.industry?.trim() || undefined,
      primaryColor,
      secondaryColor: client?.secondaryColor?.trim() || undefined,
      tones: stringList(client?.toneLabels),
      palette: stringList(client?.paletteColors),
    },
    inventory: inventoryFromAssets({ heroImageUrl: input.product.heroImageUrl, assets: input.assets, logoUrl }),
  };
}
