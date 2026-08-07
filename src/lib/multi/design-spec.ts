import { anthropic } from "@/lib/anthropic";

export type GlobalDesignSpec = {
  visualTheme: string;
  colorSystem: { primary: string; secondary: string; accent: string; temperature: "warm" | "cold" | "neutral" };
  character: { gender: string; ageRange: string; ethnicity: string; hair: string; makeup: string; outfit: string };
  product: { count: number; appearanceLock: string };
  lighting: string;
  typography: { headlineStyle: string; bodyStyle: string };
  brandFeel: string[];
};

type SpecInput = { theme: string; productDesc?: string; primaryColor?: string; toneLabels?: string[]; variant?: "A" | "B" };

/** deterministic fallback：Claude 失敗/非法 JSON 時用，確保生成不中斷（等同或優於現況）。 */
export function fallbackDesignSpec(input: SpecInput): GlobalDesignSpec {
  const primary = input.primaryColor || "#4A90D9";
  return {
    visualTheme: input.theme || "clean commercial lifestyle",
    colorSystem: { primary, secondary: "#F5F1EC", accent: "#C9A98F", temperature: "warm" },
    character: { gender: "female", ageRange: "28-38", ethnicity: "East Asian", hair: "shoulder-length natural dark brown, soft waves", makeup: "natural everyday makeup", outfit: "soft neutral casual knitwear" },
    product: { count: 0, appearanceLock: input.productDesc || "match the reference product exactly" },
    lighting: "soft natural window light, gentle shadows, warm film tone",
    typography: { headlineStyle: "bold sans-serif or clean serif headline", bodyStyle: "light sans-serif caption" },
    brandFeel: (input.toneLabels && input.toneLabels.length ? input.toneLabels : ["clean", "warm", "trustworthy"]),
  };
}

function buildSpecPrompt(input: SpecInput): string {
  const variantHint = input.variant === "B"
    ? "This is the EDITORIAL / lifestyle variant: softer, more aspirational character and lighting."
    : input.variant === "A"
    ? "This is the HIGH-CONVERSION commercial variant: confident, polished, sales-ready character and lighting."
    : "";
  return `You are a top advertising creative director. Define the GLOBAL DESIGN SPEC for a multi-cell social carousel as STRICT JSON only (no prose, no markdown fences).

THEME: ${input.theme}
BRAND PRIMARY COLOR: ${input.primaryColor || "unspecified"}
TONE: ${(input.toneLabels || []).join(", ") || "professional, fresh"}
PRODUCT: ${input.productDesc || "unspecified"}
${variantHint}

Return JSON exactly matching this TypeScript type:
{"visualTheme":string,"colorSystem":{"primary":string,"secondary":string,"accent":string,"temperature":"warm"|"cold"|"neutral"},"character":{"gender":string,"ageRange":string,"ethnicity":string,"hair":string,"makeup":string,"outfit":string},"product":{"count":number,"appearanceLock":string},"lighting":string,"typography":{"headlineStyle":string,"bodyStyle":string},"brandFeel":string[]}

Rules: All values in ENGLISH, suited for image generation. character MUST be specific (a real castable person). colorSystem MUST be fixed hex or precise color names. 80-120 words total across fields. JSON only.`;
}

export async function generateGlobalDesignSpec(input: SpecInput): Promise<GlobalDesignSpec> {
  try {
    const res = await anthropic.messages.create({
      model: "claude-opus-4-5", max_tokens: 700,
      messages: [{ role: "user", content: buildSpecPrompt(input) }],
    });
    const raw = (res.content[0] as { text: string }).text;
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const fb = fallbackDesignSpec(input);
    // 淺層 merge，缺欄位用 fallback 補（防半殘 JSON）
    return {
      visualTheme: json.visualTheme || fb.visualTheme,
      colorSystem: { ...fb.colorSystem, ...(json.colorSystem || {}) },
      character: { ...fb.character, ...(json.character || {}) },
      product: { ...fb.product, ...(json.product || {}) },
      lighting: json.lighting || fb.lighting,
      typography: { ...fb.typography, ...(json.typography || {}) },
      brandFeel: Array.isArray(json.brandFeel) && json.brandFeel.length ? json.brandFeel : fb.brandFeel,
    };
  } catch (e) {
    console.warn("[multi][design-spec] fallback used:", e);
    return fallbackDesignSpec(input);
  }
}

/** 注入 image prompt 的 GLOBAL VISUAL SYSTEM 區塊。 */
export function designSpecPromptBlock(s: GlobalDesignSpec): string {
  return `GLOBAL VISUAL SYSTEM (apply identically to EVERY cell of this carousel):
- VISUAL THEME: ${s.visualTheme}
- COLOR SYSTEM: primary ${s.colorSystem.primary}, secondary ${s.colorSystem.secondary}, accent ${s.colorSystem.accent}; overall temperature ${s.colorSystem.temperature}.
- LIGHTING: ${s.lighting}
- BRAND FEEL: ${s.brandFeel.join(", ")}

CHARACTER CONSISTENCY (the SAME person in every cell):
- ${s.character.gender}, age ${s.character.ageRange}, ${s.character.ethnicity}; hair: ${s.character.hair}; makeup: ${s.character.makeup}; outfit: ${s.character.outfit}.
- Keep exactly the same face, hair, and outfit across all cells.

TYPOGRAPHY CONSISTENCY: headline = ${s.typography.headlineStyle}; body = ${s.typography.bodyStyle}. Use the SAME two typefaces for the whole series.`;
}
