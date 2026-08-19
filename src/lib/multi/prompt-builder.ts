import type { GlobalDesignSpec } from "@/lib/multi/design-spec";
import { designSpecPromptBlock } from "@/lib/multi/design-spec";
import type { FramePlan } from "@/lib/multi/frame-planner";
import { framePlanCellBlock } from "@/lib/multi/frame-planner";
import type { VariantStyle } from "@/lib/multi/variant-style";
import { variantPromptBlock } from "@/lib/multi/variant-style";

export type LockBlocks = {
  productIdentityLock: string;   // = 現有 PRODUCT_IDENTITY_LOCK（heroComposite 時傳 ""）
  typographyLock: string;        // = 現有 TYPOGRAPHY_LOCK
  colorTempLock: string;         // = 現有 fontReferenceNote（COLOR & TONE LOCK，副圖才有）
  noTextBlock: string;           // = 現有 subImageNoText
  reserveNote: string;           // 已含在 noTextBlock；保留欄位供 hero 用（可空）
  productFreeNote: string;       // = 現有 cellProductFreeNote（hero 合成留白）
  razorExclusionNote: string;    // = 現有 razorExclusionNote
  noProductWarning: string;      // = 現有 noProductWarning
  cellNoProduct: string;         // = 現有 cellNoProduct
  imageRoleReminder: string;     // = 現有 imageRoleReminder（產品參考圖 vs 風格參考圖角色分工）
};

export type BuildInput = {
  globalSpec: GlobalDesignSpec;
  framePlan: FramePlan;
  variantStyle: VariantStyle;
  i: number;
  n: number;
  lockBlocks: LockBlocks;
  /** [VISUAL TEMPLATE] 整組共用的 ART DIRECTION 區塊；注入每一格 → 全組同一 Visual DNA。 */
  artDirectionBlock?: string;
};

/** 固定 6 段結構：GLOBAL → CHARACTER(含在 global block) → PRODUCT LOCK → TYPOGRAPHY → FRAME → NEGATIVE。 */
export function buildMultiImagePrompt(input: BuildInput): string {
  const { globalSpec, framePlan, variantStyle, i, n, lockBlocks: lb, artDirectionBlock } = input;
  const headline = framePlan.copy.headline;
  const sections: string[] = [
    "=== 0. VISUAL TEMPLATE (整組共用的 ART DIRECTION) ===",
    artDirectionBlock ?? "",
    "=== 1. GLOBAL VISUAL SYSTEM ===",
    designSpecPromptBlock(globalSpec),
    variantPromptBlock(variantStyle),
    "=== 2. TYPOGRAPHY CONSISTENCY ===",
    lb.typographyLock,
    lb.colorTempLock,
    "=== 3. PRODUCT IDENTITY LOCK ===",
    lb.productIdentityLock,
    lb.imageRoleReminder,
    "=== 4. FRAME-SPECIFIC INSTRUCTION ===",
    framePlanCellBlock(framePlan, i, n),
    i === 0 ? `HERO headline to render: "${headline}". Establish the typography/color system for the whole series. CRITICAL — render this headline (and any subtitle) EXACTLY ONCE: do NOT repeat, duplicate, mirror, or show the same title/subtitle text more than once anywhere in the image.` : `This is a supporting cell — produce a CLEAN scene photo, no typography (text added in post).`,
    lb.productFreeNote,
    lb.cellNoProduct,
    lb.razorExclusionNote,
    "=== 5. NEGATIVE CONSTRAINTS ===",
    `Keep exactly the same person across all frames. Do not change hairstyle. Do not change outfit. Do not change product packaging. Do not change product colors. Maintain identical color grading. Maintain identical lighting direction. Maintain the same brand atmosphere. Never duplicate or repeat any headline, title, subtitle, or text — each text element must appear at most ONCE in the image.`,
    lb.noProductWarning,
    lb.noTextBlock,
  ];
  return sections.filter((s) => s && s.trim()).join("\n\n");
}
