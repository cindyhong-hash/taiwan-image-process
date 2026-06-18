import type { LayoutType } from "@/types";

const COMPOSITION_DESCRIPTIONS: Record<LayoutType, string> = {
  A: "產品置中，文案下方",
  B: "產品偏右，文案左側大字",
  C: "產品滿版背景，文案疊加",
};

const COMPOSITION_AI_PROMPTS: Record<LayoutType, string> = {
  A: "dead center composition, product centered shot, minimalistic background, professional commercial photography",
  B: "rule of thirds, product on the right side, dynamic framing, bold editorial style, large text on left",
  C: "atmospheric full-bleed cinematic shot, layered typography overlay, heavy depth of field, brand immersion",
};

/** Builds the hidden AI prompt texts for each component category */
export function buildAiPromptText(params: {
  layoutType: LayoutType;
  primaryColor: string;
  secondaryColor?: string;
  toneLabels: string[];
}): { composition: string; color: string; tone: string } {
  const colorDesc = params.secondaryColor
    ? `primary brand color ${params.primaryColor}, accent color ${params.secondaryColor}`
    : `brand color ${params.primaryColor}`;

  const toneDesc =
    params.toneLabels.length > 0
      ? `${params.toneLabels.join(", ")} style, engaging and on-brand`
      : "professional and clean style";

  return {
    composition: COMPOSITION_AI_PROMPTS[params.layoutType],
    color: `${colorDesc}, cohesive color palette, brand-consistent tones, harmonious hues`,
    tone: `${toneDesc}, emotionally resonant, target-audience-aligned messaging`,
  };
}

export type ExtractedComponents = {
  composition: { layoutType: LayoutType; description: string };
  colorScheme: { primaryColor: string; secondaryColor?: string };
  copyTone: { toneLabels: string[]; layoutType: LayoutType };
};

export function extractStyleComponents(params: {
  layoutType: LayoutType;
  primaryColor: string;
  secondaryColor?: string;
  toneLabels: string[];
}): ExtractedComponents {
  return {
    composition: {
      layoutType: params.layoutType,
      description: COMPOSITION_DESCRIPTIONS[params.layoutType],
    },
    colorScheme: {
      primaryColor: params.primaryColor,
      secondaryColor: params.secondaryColor,
    },
    copyTone: {
      toneLabels: params.toneLabels,
      layoutType: params.layoutType,
    },
  };
}
