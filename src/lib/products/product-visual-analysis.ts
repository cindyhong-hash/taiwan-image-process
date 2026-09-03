import sharp from "sharp";
import { loadBuffer } from "../storage.ts";
import {
  fallbackProductVisualProfile,
  parseProductVisualProfile,
  type ProductVisualProfile,
  type ProductVisualProfileInput,
} from "./product-visual-profile.ts";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const VISION_MODEL = process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.5-flash";
const MAX_REFERENCE_IMAGES = 5;
const MAX_IMAGE_EDGE = 1600;

export type ProductBrandFacts = {
  primaryColor?: string | null;
  toneLabels?: string[] | null;
};

export type ImageSetArtDirection = {
  concept: string;
  palette: { dominant: string[]; accent: string[] };
  lighting: string;
  materials: string[];
  backgroundLanguage: string;
  cameraLanguage: string;
  consistencyRules: string[];
};

export type VisionRequest = {
  imageDataUrls: string[];
  systemPrompt: string;
  product: ProductVisualProfileInput;
};

export type ProductVisualAnalysisDependencies = {
  loadAsDataUrl?: (url: string) => Promise<string>;
  completeVision?: (request: VisionRequest) => Promise<string>;
};

const SYSTEM_PROMPT = `Only report visible image facts and supplied product text. Do not infer efficacy, certification, ingredients, safety, target demographics, or usage that is not shown or stated. Treat every image as another view of the same product. Return JSON only.

Return exactly this ProductVisualProfile JSON contract:
{
  "version": 1,
  "productType": "string",
  "productArchetype": "beauty_device | skincare | cosmetics | food_beverage | fashion | electronics | home | other",
  "confidence": 0,
  "appearance": {
    "shape": "string",
    "materials": ["string"],
    "colors": ["string"],
    "distinctiveDetails": ["string"],
    "visibleTextOrLogos": ["string"]
  },
  "useCases": ["string"],
  "suitableScenes": ["string"],
  "visualMotifs": ["string"],
  "prohibitedChanges": ["string"],
  "sourceImageCount": 0
}`;

function uniqueReferenceUrls(input: ProductVisualProfileInput): string[] {
  const rawUrls = [...new Set((input.rawImageUrls ?? []).map((url) => url.trim()).filter(Boolean))];
  const heroUrl = input.heroImageUrl?.trim() ?? "";
  if (!heroUrl) return rawUrls.slice(0, MAX_REFERENCE_IMAGES);

  return [...rawUrls.filter((url) => url !== heroUrl).slice(0, MAX_REFERENCE_IMAGES - 1), heroUrl];
}

async function defaultLoadAsDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) {
    const [, encoded = ""] = url.split(",", 2);
    const buffer = Buffer.from(encoded, url.includes(";base64,") ? "base64" : "utf8");
    const png = await sharp(buffer)
      .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  }

  const buffer = await loadBuffer(url);
  const png = await sharp(buffer)
    .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function defaultCompleteVision(request: VisionRequest): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://marketing-tool.local",
      "X-Title": "Marketing Tool",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: "system", content: request.systemPrompt },
        {
          role: "user",
          content: [
            ...request.imageDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
            {
              type: "text",
              text: JSON.stringify({
                name: request.product.name ?? "",
                description: request.product.description ?? "",
                category: request.product.category ?? "",
              }),
            },
          ],
        },
      ],
      max_tokens: 1000,
    }),
  });
  const data = await response.json() as {
    choices?: { message?: { content?: string | null } }[];
    error?: { message?: string };
  };
  if (!response.ok || data.error) throw new Error(data.error?.message ?? `OpenRouter error ${response.status}`);

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned empty vision output");
  return text;
}

export function parseVisionJson(text: string): ProductVisualProfile | null {
  const json = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return parseProductVisualProfile(JSON.parse(json));
  } catch {
    return null;
  }
}

export async function analyzeProductVisualProfile(
  input: ProductVisualProfileInput,
  deps: ProductVisualAnalysisDependencies = {},
): Promise<ProductVisualProfile> {
  const urls = uniqueReferenceUrls(input);
  if (urls.length === 0) return fallbackProductVisualProfile(input);

  try {
    const loadAsDataUrl = deps.loadAsDataUrl ?? defaultLoadAsDataUrl;
    const completeVision = deps.completeVision ?? defaultCompleteVision;
    const imageDataUrls = await Promise.all(urls.map(loadAsDataUrl));
    const profile = parseVisionJson(await completeVision({ imageDataUrls, systemPrompt: SYSTEM_PROMPT, product: input }));
    return profile ? { ...profile, sourceImageCount: imageDataUrls.length } : fallbackProductVisualProfile(input);
  } catch {
    return fallbackProductVisualProfile(input);
  }
}

export function buildImageSetArtDirection(
  profile: ProductVisualProfile,
  brand: ProductBrandFacts,
): ImageSetArtDirection {
  const dominant = profile.appearance.colors;
  const accent = brand.primaryColor?.trim() ? [brand.primaryColor.trim()] : [];
  const productDescription = [profile.productType, profile.appearance.shape].filter(Boolean).join("，");

  return {
    concept: productDescription ? `${productDescription} 的一致產品攝影` : "一致產品攝影",
    palette: { dominant, accent },
    lighting: "柔和、乾淨且跨畫面一致的產品攝影光線",
    materials: profile.appearance.materials,
    backgroundLanguage: profile.suitableScenes[0] ?? "乾淨且保留呼吸感的背景",
    cameraLanguage: "清晰產品攝影，保留真實比例與可辨識細節",
    consistencyRules: [
      "所有畫面視為同一產品的不同視角。",
      "維持產品的外型、比例、顏色、結構與可見 Logo／文字。",
      ...profile.prohibitedChanges,
      ...(brand.toneLabels?.filter(Boolean).map((tone) => `品牌調性：${tone}`) ?? []),
    ],
  };
}
