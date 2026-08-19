/**
 * Visual Template System — 型別（規劃層）
 * ─────────────────────────────────────────────────────────────────────────────
 * 概念分工：
 *   Activity Layout（現有 12 個，固定不動）＝ 空間結構「圖片怎麼排」
 *   Visual Template（本系統，80–100 個）      ＝ 整組視覺 DNA「整組長什麼樣」
 *   Frame Planner（現有）                      ＝ 內容方向「每張放什麼」
 *
 * 最重要規則：同一次生成的所有 frame，共用「同一個」Visual Template（同一 Visual DNA）。
 * 本檔只定義型別，不含資料、不接生成。
 */

import type { SubCardVariant } from "@/lib/composite-multi";

export type VisualTemplateCategory =
  | "clean_minimal"        // A
  | "lifestyle_human"      // B
  | "editorial_magazine"   // C
  | "social_conversation"  // D
  | "gradient_overlay"     // E
  | "product_ecom"         // F
  | "beauty_wellness"      // G
  | "collage_scrapbook"    // H
  | "cinematic_story"      // I
  | "info_educational"     // J
  | "promotional_campaign" // K
  | "special";             // 補充（Luxury/Retro/Pop/Organic…）

/** 內容訊號：selector 依活動內容比對，決定推薦哪些 Template。 */
export type ContentSignal =
  | "product" | "lifestyle" | "promotion" | "tutorial" | "before_after"
  | "testimonial" | "editorial" | "beauty" | "travel" | "medical"
  | "launch" | "seasonal" | "wellness" | "food" | "fashion"
  | "announcement" | "story" | "cta";

export type VisualTemplate = {
  id: string;
  name: string;
  category: VisualTemplateCategory;
  description: string;
  /** 一句話設計概念（給人看/除錯用） */
  visualConcept: string;

  colorSystem: {
    /** 以「描述＋可選 hex」為主；品牌主色仍由品牌記憶覆寫，這裡定義的是「用色語法」。 */
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    gradient?: string;
  };

  typography: {
    hierarchy: string;      // 標題/內文層級關係
    headlineStyle: string;  // 大標風格
    bodyStyle: string;      // 內文風格
    labelStyle: string;     // 小標籤風格
    alignment: string;      // 對齊邏輯
  };

  imageTreatment: {
    photographyStyle: string;
    lighting: string;
    contrast: string;
    saturation: string;
    grain?: string;
    depthOfField?: string;
  };

  composition: {
    visualHierarchy: string;
    readingDirection: string;
    whitespace: string;
    balance: string;
    imageScale: string;
  };

  subjectTreatment: {
    people: string;
    product: string;
    environment: string;
  };

  textTreatment: {
    placement: string;
    overlay: string;
    textBox?: string;
    gradient?: string;
    badge?: string;
    caption?: string;
    /** 整組共用的圖卡樣式（對應現有 composite 的 SubCardVariant）——確保全組同一種卡片語言。 */
    cardVariant: SubCardVariant;
  };

  decorativeElements: string[];
  shapeLanguage: string;
  /** 供 prompt 注入的「一致性守則」——每格都必須遵守，確保整組像同一個設計師做的。 */
  consistencyRules: string[];

  recommendedFor: ContentSignal[];
  avoid: string[];

  /** 滿版：拼版無格縫(gap=0)、無灰底、副圖不套白卡（文字直接壓在照片上）。預設 false=圓角白卡＋淡底。 */
  fullBleed?: boolean;

  /** 各 frame 角色的視覺處理提示（hero / secondary / supporting / closing）。 */
  frameRoles: {
    hero?: string;
    secondary?: string;
    supporting?: string;
    closing?: string;
  };
};
