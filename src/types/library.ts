// ─── Library / Asset types ────────────────────────────────────────────────────

/**
 * Feature flag：#4 系列圖（固定模板貼圖）。報告期間暫時收起（UI + 圖庫隱藏其成圖）。
 * 將來想攞返出嚟繼續做：改 true 即可（UI 同圖庫一齊復原）。對應 mode = "paste-template"。
 */
export const SHOW_SERIES_TEMPLATE = false;

export type ComponentCategory = "COMPOSITION" | "COLOR_SCHEME" | "COPY_TONE" | "BACKGROUND";

export type SlotKey = "layout" | "color" | "tone" | "background";

export const CATEGORY_META: Record<
  ComponentCategory,
  { label: string; slot: SlotKey; color: string; bg: string; border: string }
> = {
  COMPOSITION: {
    label: "構圖",
    slot: "layout",
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
  },
  COLOR_SCHEME: {
    label: "配色",
    slot: "color",
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
  },
  COPY_TONE: {
    label: "語氣",
    slot: "tone",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  BACKGROUND: {
    label: "背景",
    slot: "background",
    color: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
  },
};

// ─── Color palette ──────────────────────────────────────────────────────────
// 5-color brand palette. The cap is a UI constant — data is stored as an array
// so it can grow later without a schema change.

export type PaletteRole = "primary" | "secondary" | "accent" | "neutral" | "highlight";

export interface PaletteColor {
  hex: string;
  role: PaletteRole;
  label: string;
}

/** Generation-time palette entry — carries a use/skip flag (not persisted on the component). */
export interface PaletteColorWithUse extends PaletteColor {
  use: boolean;
}

/** The 5 palette roles, in display order. `primary` is always used; the rest are toggleable at generation time. */
export const PALETTE_ROLES: { role: PaletteRole; label: string; hint: string; toggleable: boolean }[] = [
  { role: "primary",   label: "主色",   hint: "品牌核心、主導",       toggleable: false },
  { role: "secondary", label: "輔色",   hint: "次要搭配",             toggleable: true  },
  { role: "accent",    label: "強調色", hint: "重點 / CTA / 行動點",  toggleable: true  },
  { role: "neutral",   label: "中性色", hint: "背景 / 留白 / 文字底", toggleable: true  },
  { role: "highlight", label: "點綴色", hint: "細節提亮 / 裝飾",      toggleable: true  },
];

export const MAX_PALETTE_COLORS = PALETTE_ROLES.length; // 5

export function roleLabel(role: PaletteRole): string {
  return PALETTE_ROLES.find((r) => r.role === role)?.label ?? role;
}

/**
 * Read a COLOR_SCHEME component's colors as a normalized array.
 * Prefers the new `data.colors[]`; falls back to legacy `primaryColor`/`secondaryColor`
 * so existing components keep rendering.
 */
export function getColors(data: Record<string, unknown> | undefined | null): PaletteColor[] {
  if (!data) return [];
  const arr = data.colors as PaletteColor[] | undefined;
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.filter((c) => c && typeof c.hex === "string");
  }
  const out: PaletteColor[] = [];
  const p = data.primaryColor as string | undefined;
  const s = data.secondaryColor as string | undefined;
  if (p) out.push({ hex: p, role: "primary", label: "主色" });
  if (s) out.push({ hex: s, role: "secondary", label: "輔色" });
  return out;
}

// ─── Components ────────────────────────────────────────────────────────────────

export interface StyleComponent {
  id: string;
  name: string;
  type: ComponentCategory;
  data: Record<string, unknown>;
  clientId: string | null;
  aiPromptText: string;
  sourceLayoutId: string;
  previewUrl: string | null;
  createdAt: string;
}

export interface GeneratedAsset {
  id: string;
  imageUrl: string;
  layoutType: string;
  copyText: string;
  activity: { theme: string; clientId: string; client: { name: string } };
}

// ─── Library-generated images + gallery ─────────────────────────────────────

export interface LibraryImageRow {
  id: string;
  clientId: string | null;
  imageUrl: string;
  prompt: string;
  copyText: string | null;
  subject: string | null;
  createdAt: string;
}

/** A single tile in the brand image gallery (merged 風格組件 tab). */
export type GalleryItem =
  | {
      /** "uploaded" = analysed image (構圖/配色/語氣); "material" = 背景素材 (background-only). */
      kind: "uploaded" | "material";
      imageUrl: string;
      types: ComponentCategory[];
      componentIds: string[];
      name: string;
      createdAt: string;
      /** AI-generated background only: the description used to generate it. */
      aiPromptText?: string;
      /** AI-generated background only: the engine mode (e.g. "flux-scene"). */
      mode?: string;
    }
  | {
      kind: "generated";
      imageUrl: string;
      libraryImageId: string;
      copyText: string | null;
      subject: string | null;
      paramsJson: string;
      prompt: string | null;
      createdAt: string;
      /** PENDING｜GENERATING｜DONE｜FAILED（舊資料一律 DONE）。 */
      status: string;
      errorMessage?: string | null;
      batchId?: string | null;
    };

/** Payload to open the shared ImageDetailModal (from gallery / card / 圖片紀錄). */
export interface ImageDetail {
  imageUrl: string | null;
  presetComponents?: StyleComponent[];
  copyText?: string | null;
  subject?: string | null;
  /** paramsJson of a generated LibraryImage — enables 重新生成. */
  regenerateParams?: string;
  prompt?: string | null;
  /** LibraryImage id — enables delete in modal. */
  libraryImageId?: string;
}

/** Human-facing AI-engine label for a generated image (from paramsJson.mode). */
export function engineLabel(paramsJson?: string | null): string | null {
  if (!paramsJson) return null;
  try {
    const mode = JSON.parse(paramsJson).mode as string | undefined;
    if (!mode) return null;
    const map: Record<string, string> = {
      "fal-edit": "Nano Banana",
      "flux2-edit": "FLUX.2 edit",
      "seedream-edit": "Seedream 4.5",
      "qwen-edit": "Qwen edit",
      "bria-preserve": "Bria",
      "bria": "Bria",
      "gpt-image": "GPT image",
      "gpt-image-mini": "GPT image mini",
      "paste-text": "文字保真",
      "paste-template": "固定模板",
      "sharp": "疊圖",
      "flux": "FLUX",
      "flux-scene": "FLUX.1",
      "flux2-person": "FLUX.2 pro",
      "recraft-illustration": "Recraft V3",
      "nano-banana": "Nano Banana",
    };
    return map[mode] ?? mode;
  } catch {
    return null;
  }
}

/** The four slots the PromptComposer manages. */
export interface PromptSlots {
  layout: StyleComponent | null;
  color: StyleComponent | null;
  tone: StyleComponent | null;
  background: StyleComponent | null;
}
