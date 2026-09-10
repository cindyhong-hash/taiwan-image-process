import sharp from "sharp";
import { loadBuffer } from "../storage.ts";
import type { AdLayoutContext } from "./ad-layout-context.ts";
import { prepareAdBackground } from "./ad-layout-data.ts";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_VISION_MODEL = "google/gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_IMAGE_EDGE = 768;

const ASSESSED_ROLES = ["background", "detail", "benefit", "decoration"] as const;
const IMAGE_ROLES = ["hero", ...ASSESSED_ROLES] as const;
const SAFE_AREAS = ["left-top", "right-top", "left-center", "bottom", "unknown"] as const;
const SURFACES = ["counter", "shelf", "platform", "table", "none", "unknown"] as const;

export type AdLayoutVisionSource = "vision" | "fallback";
export type AssessedVisualRole = typeof ASSESSED_ROLES[number];
export type AdLayoutVisionImageRole = typeof IMAGE_ROLES[number];
export type AdLayoutTextSafeAreaAdvice = typeof SAFE_AREAS[number];
export type AdLayoutPlacementSurface = typeof SURFACES[number];
export type AdLayoutSurfaceRect = { x: number; y: number; w: number; h: number };

export type AssetSafety = {
  safeForDeclaredRole: boolean;
  productVisible: boolean;
  textOrLogoVisible: boolean;
  completeSceneVisible: boolean;
  confidence: number;
  reason?: string;
};

export type ParsedVisionAssessment = {
  version: 1;
  assets: Partial<Record<AssessedVisualRole, AssetSafety>>;
  background?: {
    textSafeArea: AdLayoutTextSafeAreaAdvice;
    placementSurface: AdLayoutPlacementSurface;
    surfaceRect?: AdLayoutSurfaceRect;
    confidence: number;
  };
};

export type AdLayoutVisionAssessment = ParsedVisionAssessment & {
  source: AdLayoutVisionSource;
  warnings: string[];
};

export type AdLayoutVisionRequest = {
  imageDataUrls: string[];
  imageRoles: AdLayoutVisionImageRole[];
  systemPrompt: string;
  signal?: AbortSignal;
};

export type AdLayoutVisionDependencies = {
  apiKey?: string | null;
  model?: string;
  timeoutMs?: number;
  backgroundCanvas?: { width: number; height: number };
  loadAsDataUrl?: (url: string, signal?: AbortSignal, canvas?: { width: number; height: number }) => Promise<string>;
  completeVision?: (request: AdLayoutVisionRequest) => Promise<string>;
};

const SYSTEM_PROMPT = `You are an asset-safety reviewer for an editable product-ad designer. Report only visible facts from the labelled images. Evaluate each candidate image independently: each image is immediately following that role label. The hero is a separate identity reference; never evaluate it as removable. Do not attribute anything visible in the hero reference to another role. Do not infer product claims, audience, performance, ingredients, or a new design. Do not output arbitrary layer coordinates, template IDs, URLs, colors, effects, image edits, or prose. surfaceRect is the only allowed coordinate field.

Return strict JSON only:
{
  "version": 1,
  "assets": {
    "background": { "safeForDeclaredRole": true, "productVisible": false, "textOrLogoVisible": false, "completeSceneVisible": false, "confidence": 0.9, "reason": "optional short visible-fact reason" },
    "detail": { "safeForDeclaredRole": true, "productVisible": false, "textOrLogoVisible": false, "completeSceneVisible": false, "confidence": 0.9 },
    "benefit": { "safeForDeclaredRole": true, "productVisible": false, "textOrLogoVisible": false, "completeSceneVisible": false, "confidence": 0.9 },
    "decoration": { "safeForDeclaredRole": true, "productVisible": false, "textOrLogoVisible": false, "completeSceneVisible": false, "confidence": 0.9 }
  },
  "background": { "textSafeArea": "left-top", "placementSurface": "counter", "surfaceRect": { "x": 0.08, "y": 0.62, "w": 0.55, "h": 0.10 }, "confidence": 0.9 }
}

Each enum field must contain exactly one value, never a pipe-delimited list. Choose the value from visible evidence; do not copy the example unless it is accurate.
textSafeArea must be exactly one of: left-top | right-top | left-center | bottom | unknown
placementSurface must be exactly one of: counter | shelf | platform | table | none | unknown
When a clearly usable counter, shelf, platform, or table is visible, surfaceRect must tightly describe that surface in normalized coordinates relative to the supplied background: x, y, w, and h must each be between 0 and 1, with x+w and y+h no greater than 1. The y value is the visible top edge where a product can stand. Omit surfaceRect when no clear usable surface is visible.
For background, productVisible means any complete product/package visible in that background image. A complete clean environmental scene (for example an empty bathroom or tabletop) is a valid background; completeSceneVisible alone never makes a background unsafe. Omit unavailable roles from assets.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseSurfaceRect(value: unknown): AdLayoutSurfaceRect | undefined {
  if (!isRecord(value)) return undefined;
  const { x, y, w, h } = value;
  if (![x, y, w, h].every((part) => typeof part === "number" && Number.isFinite(part))) return undefined;
  const rect = { x: x as number, y: y as number, w: w as number, h: h as number };
  if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0 || rect.x + rect.w > 1 || rect.y + rect.h > 1) return undefined;
  return rect;
}

function parseSafety(value: unknown): AssetSafety | null {
  if (!isRecord(value)) return null;
  const { safeForDeclaredRole, productVisible, textOrLogoVisible, completeSceneVisible, confidence, reason } = value;
  if (
    typeof safeForDeclaredRole !== "boolean" ||
    typeof productVisible !== "boolean" ||
    typeof textOrLogoVisible !== "boolean" ||
    typeof completeSceneVisible !== "boolean" ||
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    (reason !== undefined && typeof reason !== "string")
  ) return null;
  return {
    safeForDeclaredRole,
    productVisible,
    textOrLogoVisible,
    completeSceneVisible,
    confidence: clamp(confidence),
    ...(typeof reason === "string" && reason.trim() ? { reason: reason.trim().slice(0, 240) } : {}),
  };
}

type VisionParseResult =
  | { value: ParsedVisionAssessment; reason?: never }
  | { value: null; reason: string };

function parseBackground(value: unknown): { value: NonNullable<ParsedVisionAssessment["background"]>; reason?: never } | { value: null; reason: string } {
  if (!isRecord(value)) return { value: null, reason: "background must be an object" };
  const { textSafeArea, placementSurface, surfaceRect, confidence } = value;
  if (!hasValue(SAFE_AREAS, textSafeArea)) return { value: null, reason: "background.textSafeArea is not an allowed value" };
  if (!hasValue(SURFACES, placementSurface)) return { value: null, reason: "background.placementSurface is not an allowed value" };
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return { value: null, reason: "background.confidence must be a finite number" };
  const parsedSurfaceRect = parseSurfaceRect(surfaceRect);
  return { value: {
    textSafeArea,
    placementSurface,
    ...(parsedSurfaceRect ? { surfaceRect: parsedSurfaceRect } : {}),
    confidence: clamp(confidence),
  } };
}

function parseAdLayoutVisionAssessmentResult(text: string): VisionParseResult {
  const fence = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = fence ? fence[1] : text.trim();
  try {
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.assets)) {
      return { value: null, reason: "root must contain version 1 and an assets object" };
    }
    const assets: ParsedVisionAssessment["assets"] = {};
    for (const role of ASSESSED_ROLES) {
      if (!(role in parsed.assets)) continue;
      const safety = parseSafety(parsed.assets[role]);
      if (!safety) return { value: null, reason: `assets.${role} has invalid safety fields` };
      assets[role] = safety;
    }
    if (parsed.background === undefined) return { value: { version: 1, assets } };
    const background = parseBackground(parsed.background);
    return background.value
      ? { value: { version: 1, assets, background: background.value } }
      : background;
  } catch {
    return { value: null, reason: "response is not valid JSON" };
  }
}

export function parseAdLayoutVisionAssessment(text: string): ParsedVisionAssessment | null {
  return parseAdLayoutVisionAssessmentResult(text).value;
}

function fallback(message: string): AdLayoutVisionAssessment {
  return { version: 1, assets: {}, source: "fallback", warnings: [message] };
}

async function defaultLoadAsDataUrl(url: string, signal?: AbortSignal, canvas?: { width: number; height: number }): Promise<string> {
  signal?.throwIfAborted();
  const loaded = Buffer.from(await loadBuffer(url, signal));
  const source = canvas ? await prepareAdBackground(loaded, canvas.width, canvas.height) : loaded;
  const png = await sharp(source)
    .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  signal?.throwIfAborted();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function defaultCompleteVision(request: AdLayoutVisionRequest, apiKey: string, model: string): Promise<string> {
  const content = request.imageDataUrls.flatMap((url, index) => [
    { type: "text", text: `Image role: ${request.imageRoles[index]}` },
    { type: "image_url", image_url: { url } },
  ]);
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://marketing-tool.local",
      "X-Title": "Marketing Tool",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content },
      ],
      max_tokens: 900,
      temperature: 0,
    }),
    signal: request.signal,
  });
  const data = await response.json() as { choices?: { message?: { content?: string | null } }[]; error?: { message?: string } };
  if (!response.ok || data.error) throw new Error(data.error?.message ?? `OpenRouter error ${response.status}`);
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned empty vision output");
  return text;
}

function mergedAbortSignal(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abortParent = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", abortParent, { once: true });
  if (parent?.aborted) abortParent();
  const timer = setTimeout(() => controller.abort(new DOMException("Vision assessment timed out", "TimeoutError")), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abortParent);
    },
  };
}

export async function assessAdLayoutVisualKit(
  context: AdLayoutContext,
  deps: AdLayoutVisionDependencies = {},
  parentSignal?: AbortSignal,
): Promise<AdLayoutVisionAssessment> {
  const hero = context.inventory.byRole.hero;
  if (!hero) return fallback("缺少商品主體，已使用穩定設計規則");
  const selected = IMAGE_ROLES.flatMap((role) => {
    const asset = role === "hero" ? hero : context.inventory.byRole[role];
    return asset ? [{ role, imageUrl: asset.imageUrl }] : [];
  });
  const apiKey = deps.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!deps.completeVision && !apiKey) return fallback("未設定視覺判讀服務，已使用穩定設計規則");

  const { signal, dispose } = mergedAbortSignal(parentSignal, deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const loadAsDataUrl = deps.loadAsDataUrl ?? defaultLoadAsDataUrl;
    const imageDataUrls = await Promise.all(selected.map((asset) => loadAsDataUrl(
      asset.imageUrl,
      signal,
      asset.role === "background" ? deps.backgroundCanvas : undefined,
    )));
    signal.throwIfAborted();
    const request: AdLayoutVisionRequest = {
      imageDataUrls,
      imageRoles: selected.map((asset) => asset.role),
      systemPrompt: SYSTEM_PROMPT,
      signal,
    };
    const text = deps.completeVision
      ? await deps.completeVision(request)
      : await defaultCompleteVision(request, apiKey!, deps.model ?? process.env.OPENROUTER_VISION_MODEL ?? DEFAULT_VISION_MODEL);
    signal.throwIfAborted();
    const parsed = parseAdLayoutVisionAssessmentResult(text);
    if (parsed.value) return { ...parsed.value, source: "vision", warnings: [] };
    console.warn(`[ad-layout-vision] Rejected provider response: ${parsed.reason}; using fallback`);
    return fallback("素材視覺判讀格式無效，已使用穩定設計規則");
  } catch {
    return fallback(signal.aborted ? "素材視覺判讀逾時，已使用穩定設計規則" : "素材視覺判讀不可用，已使用穩定設計規則");
  } finally {
    dispose();
  }
}
