export type VariantKey = "A" | "B";

export type VariantStyle = {
  key: VariantKey;
  label: string;            // 顯示用（沿用現有「A 導購版 / B 敘事版」）
  designLanguage: string;   // 一句話定調
  productScale: string;     // 產品在畫面的份量
  contrast: string;         // 對比/明暗
  negativeSpace: string;    // 留白
  ctaEmphasis: string;      // CTA/導購強度
};

export const VARIANT_STYLE: Record<VariantKey, VariantStyle> = {
  A: {
    key: "A",
    label: "A 導購版",
    designLanguage: "High-conversion commercial poster. Bold, punchy, sales-driven.",
    productScale: "Product is LARGE and central — occupies a dominant portion of the frame, clearly the hero.",
    contrast: "Strong contrast, saturated highlights, crisp product edges, clear figure-ground separation.",
    negativeSpace: "Minimal negative space — fill the frame with product, benefit cues, and a clear focal hierarchy.",
    ctaEmphasis: "Strong call-to-action energy: urgency, benefit-forward composition, room for a bold headline block.",
  },
  B: {
    key: "B",
    label: "B 敘事版",
    designLanguage: "Editorial magazine lifestyle. Calm, aspirational, brand-atmosphere-driven.",
    productScale: "Product is SMALL and understated — integrated into a lifestyle scene, not dominating it.",
    contrast: "Soft contrast, gentle film tone, muted highlights, airy and refined.",
    negativeSpace: "Generous negative space — let the scene breathe; large clean areas for elegant typography.",
    ctaEmphasis: "No hard selling: mood, story, and lifestyle proposition over explicit CTA.",
  },
};

/** 注入 image prompt 的 VARIANT 區塊（英文，供 prompt-builder 用）。 */
export function variantPromptBlock(v: VariantStyle): string {
  return `VARIANT DESIGN LANGUAGE — ${v.designLanguage}
- PRODUCT SCALE: ${v.productScale}
- CONTRAST & TONE: ${v.contrast}
- NEGATIVE SPACE: ${v.negativeSpace}
- CTA / EMPHASIS: ${v.ctaEmphasis}
Apply this design language consistently to every cell of THIS variant, so this whole set is visibly distinct from the other variant.`;
}
