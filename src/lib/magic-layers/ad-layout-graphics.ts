import { graphemes } from "./editable-text.ts";

export type BenefitInput = { id: string; text: string };
export type BenefitIcon = "water-drop" | "spring" | "blade" | "shield" | "sparkle" | "leaf" | "sun" | "clean" | "repair" | "texture";
export type BenefitSemantic = "hydration" | "cushioning" | "blade" | "protection" | "radiance" | "botanical" | "sun-day" | "cleansing" | "repair" | "texture-smoothness";
export type BenefitGraphic = { benefitId: string; icon: BenefitIcon | null; number: string | null };

export const BENEFIT_ICON_REGISTRY: ReadonlyArray<{
  semantic: BenefitSemantic;
  icon: BenefitIcon;
  patterns: readonly RegExp[];
}> = [
  { semantic: "hydration", icon: "water-drop", patterns: [/保濕|補水|水潤|hydrat|moistur/i] },
  { semantic: "cushioning", icon: "spring", patterns: [/吸震|緩震|彈力|shock|cushion|spring/i] },
  { semantic: "blade", icon: "blade", patterns: [/刀片|刀頭|刮毛|blade|razor/i] },
  { semantic: "protection", icon: "shield", patterns: [/防護|保護|屏障|protect|barrier|shield/i] },
  { semantic: "radiance", icon: "sparkle", patterns: [/光澤|亮澤|透亮|亮白|radiant|glow|sparkle/i] },
  { semantic: "botanical", icon: "leaf", patterns: [/植物|葉|植萃|草本|leaf|botanic|herbal/i] },
  { semantic: "sun-day", icon: "sun", patterns: [/防曬|日間|陽光|紫外線|sun|daytime|uv\b/i] },
  { semantic: "cleansing", icon: "clean", patterns: [/潔淨|清潔|淨化|去污|clean|purif/i] },
  { semantic: "repair", icon: "repair", patterns: [/修護|修復|舒緩|repair|restore|sooth/i] },
  { semantic: "texture-smoothness", icon: "texture", patterns: [/質地|柔滑|平滑|細緻|texture|smooth|silky/i] },
];

const NEGATION = /(?:不|無|未|沒有)|\b(?:not|without|no)\b/i;
const NUMBER_PHRASE = /\d+(?:\.\d+)?\s*(?:%|倍|小時|hours?|hrs?|hr|天|刀片|x)?|[一二三四五六七八九十百兩]+(?:重|倍|小時|天|刀片)/i;

export function parseBenefits(value: unknown): BenefitInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) throw new Error("賣點最多三條");
  return value.map((text, index) => {
    if (typeof text !== "string" || !text.trim() || graphemes(text).length > 40) throw new Error("每條賣點請填寫 1–40 字");
    return { id: `benefit-${index + 1}`, text: text.trim() };
  });
}

export function matchBenefitGraphic(benefit: BenefitInput): BenefitGraphic {
  const number = benefit.text.match(NUMBER_PHRASE)?.[0]?.trim() ?? null;
  if (NEGATION.test(benefit.text)) return { benefitId: benefit.id, icon: null, number };
  const match = BENEFIT_ICON_REGISTRY.find((entry) => entry.patterns.some((pattern) => pattern.test(benefit.text)));
  return { benefitId: benefit.id, icon: match?.icon ?? null, number };
}
