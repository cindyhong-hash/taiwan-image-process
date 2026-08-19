/**
 * Visual Template Selector（規劃層）
 * ─────────────────────────────────────────────────────────────────────────────
 * - inferContentSignals：從活動內容推內容訊號
 * - recommendVisualTemplates：依訊號計分排序（deterministic，不 random）
 * - pickVisualTemplate：從推薦前段挑「一個」（用 seed 變化 → 每次生成換一種設計）
 * - visualTemplatePromptBlock：把選中的 Template 轉成「整組共用的 ART DIRECTION」注入 prompt
 *     → 這是「同一次生成所有 frame 共用同一 Visual DNA」的落實點。
 * 不接生成、不動 API/Prisma。
 */
import { VISUAL_TEMPLATES } from "@/lib/multi/visual-templates";
import type { VisualTemplate, ContentSignal } from "@/lib/multi/visual-template-types";

export type SelectInput = {
  theme?: string;
  focusPoint?: string;
  requiredText?: string;
  imagePrompt?: string;
  hasProduct?: boolean;
  hasCharacter?: boolean;
  /** 若外部已知訊號可直接給，會與關鍵字推斷合併。 */
  signals?: ContentSignal[];
};

// 關鍵字 → 內容訊號（中英皆含）
const KEYWORD_SIGNALS: { re: RegExp; signals: ContentSignal[] }[] = [
  { re: /醫美|修護|皮膚|診所|療程|clinic|derma|medical/i, signals: ["medical", "beauty"] },
  { re: /保養|美容|化妝|彩妝|護膚|beauty|skincare|makeup/i, signals: ["beauty", "wellness"] },
  { re: /健康|養生|舒緩|放鬆|wellness|spa|relax/i, signals: ["wellness"] },
  { re: /旅遊|旅行|渡假|出遊|travel|trip|vacation/i, signals: ["travel", "lifestyle"] },
  { re: /促銷|優惠|折扣|限時|特價|檔期|sale|offer|discount|deal/i, signals: ["promotion", "seasonal"] },
  { re: /教學|步驟|怎麼|如何|how\s*to|tutorial|step/i, signals: ["tutorial"] },
  { re: /前後|對比|改善|before|after/i, signals: ["before_after"] },
  { re: /上市|新品|發表|launch|new/i, signals: ["launch"] },
  { re: /節|季|夏|冬|春|秋|聖誕|新年|seasonal|summer|winter/i, signals: ["seasonal"] },
  { re: /食|餐|美食|料理|飲|food|meal|drink/i, signals: ["food", "lifestyle"] },
  { re: /穿搭|時尚|服飾|fashion|outfit|style/i, signals: ["fashion", "editorial"] },
  { re: /見證|評價|口碑|推薦|testimonial|review/i, signals: ["testimonial"] },
  { re: /雜誌|編輯|質感|editorial|magazine/i, signals: ["editorial"] },
  { re: /生活|日常|lifestyle|daily/i, signals: ["lifestyle"] },
];

export function inferContentSignals(input: SelectInput): ContentSignal[] {
  const text = [input.theme, input.focusPoint, input.requiredText, input.imagePrompt].filter(Boolean).join(" ");
  const out = new Set<ContentSignal>(input.signals ?? []);
  for (const { re, signals } of KEYWORD_SIGNALS) if (re.test(text)) signals.forEach((s) => out.add(s));
  if (input.hasProduct) out.add("product");
  if (out.size === 0) out.add("lifestyle"); // 預設
  return [...out];
}

export type Recommendation = { template: VisualTemplate; score: number; matched: ContentSignal[] };

/** 依內容訊號對每個 Template 計分排序。 */
export function recommendVisualTemplates(input: SelectInput, limit = 8): Recommendation[] {
  const signals = inferContentSignals(input);
  const sset = new Set(signals);
  const ranked = VISUAL_TEMPLATES.map((template) => {
    const matched = template.recommendedFor.filter((s) => sset.has(s));
    let score = matched.length * 15;
    if (input.hasProduct && template.recommendedFor.includes("product")) score += 8;
    if (input.hasCharacter && /people|portrait|human|candid|人物/i.test(JSON.stringify(template.subjectTreatment))) score += 4;
    // 給每個 Template 一點基礎分，避免完全 0（讓沒完全命中的仍可被選，但排後面）
    score += 1;
    return { template, score, matched };
  });
  return ranked
    .sort((a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id))
    .slice(0, limit);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * 從推薦前段挑「一個」Visual Template。
 * seedKey 不同 → 可能挑到不同的（實現「每次生成換一種整組設計」）。
 * poolSize：從前幾名裡挑（保證仍是「適合」的，但有變化）。
 */
export function pickVisualTemplate(input: SelectInput, seedKey: string, poolSize = 5): VisualTemplate {
  // 開發測試用：FORCE_VT=<id> 可強制某個 template（正式環境不設此變數）。
  if (process.env.FORCE_VT) {
    const forced = getVisualTemplateById(process.env.FORCE_VT);
    if (forced) return forced;
  }
  const recs = recommendVisualTemplates(input, Math.max(poolSize, 1));
  const pool = recs.length ? recs : recommendVisualTemplates({}, poolSize);
  const idx = hashStr(seedKey) % pool.length;
  return pool[idx].template;
}

export function getVisualTemplateById(id: string): VisualTemplate | undefined {
  return VISUAL_TEMPLATES.find((t) => t.id === id);
}

/**
 * 【一致性核心】把選中的 Template 轉成「整組 ART DIRECTION」文字區塊，
 * 注入每一格的 image prompt → 所有 frame 共用同一 Visual DNA。
 */
export function visualTemplatePromptBlock(t: VisualTemplate): string {
  return `GLOBAL ART DIRECTION — VISUAL TEMPLATE "${t.name}" (apply IDENTICALLY to EVERY frame of this set; all frames must look like one designer, one campaign):
- CONCEPT: ${t.visualConcept}
- COLOR SYSTEM: primary ${t.colorSystem.primary}; secondary ${t.colorSystem.secondary}; accent ${t.colorSystem.accent}; background ${t.colorSystem.background}${t.colorSystem.gradient ? `; gradient ${t.colorSystem.gradient}` : ""}.
- TYPOGRAPHY: ${t.typography.hierarchy}; headline ${t.typography.headlineStyle}; body ${t.typography.bodyStyle}; label ${t.typography.labelStyle}; alignment ${t.typography.alignment}.
- IMAGE TREATMENT: ${t.imageTreatment.photographyStyle}; lighting ${t.imageTreatment.lighting}; contrast ${t.imageTreatment.contrast}; saturation ${t.imageTreatment.saturation}${t.imageTreatment.grain ? `; grain ${t.imageTreatment.grain}` : ""}${t.imageTreatment.depthOfField ? `; depth ${t.imageTreatment.depthOfField}` : ""}.
- COMPOSITION: hierarchy ${t.composition.visualHierarchy}; reading ${t.composition.readingDirection}; whitespace ${t.composition.whitespace}; balance ${t.composition.balance}; image scale ${t.composition.imageScale}.
- SUBJECTS: people — ${t.subjectTreatment.people}; product — ${t.subjectTreatment.product}; environment — ${t.subjectTreatment.environment}.
- TEXT TREATMENT: placement ${t.textTreatment.placement}; overlay ${t.textTreatment.overlay}${t.textTreatment.badge ? `; badge ${t.textTreatment.badge}` : ""}.
- DECORATION: ${t.decorativeElements.join(", ")}. SHAPE LANGUAGE: ${t.shapeLanguage}.
- CONSISTENCY RULES (non-negotiable): ${t.consistencyRules.join("; ")}.
- AVOID: ${t.avoid.join(", ")}.`;
}

export type HeroTitleStyle = "classic" | "brandGrad" | "shadow" | "outline";

/** 依 Visual Template 的分類，決定主圖標題的燒字設計風格（讓燒字有設計、又對齊整組 DNA）。 */
export function heroTitleStyleFor(t: VisualTemplate): HeroTitleStyle {
  switch (t.category) {
    case "clean_minimal": return "shadow";        // 乾淨無底板、細膩
    case "editorial_magazine": return "outline";   // 雜誌大標描邊
    case "gradient_overlay": return "brandGrad";    // 漸變壓底
    case "cinematic_story": return "classic";       // 電影黑漸層字幕感
    case "promotional_campaign": return "classic";  // 促銷高對比
    case "special": return "classic";               // 精品黑金
    case "lifestyle_human":
    case "beauty_wellness":
    case "product_ecom":
    case "social_conversation":
    case "collage_scrapbook":
    case "info_educational":
    default: return "brandGrad";                    // 品牌色漸層、融入相片、易讀
  }
}

/** 取某個 frame 角色的視覺提示（hero/secondary/supporting/closing）。 */
export function frameRoleHint(t: VisualTemplate, role: "hero" | "secondary" | "supporting" | "closing"): string {
  return t.frameRoles[role] ?? t.frameRoles.supporting ?? "";
}
