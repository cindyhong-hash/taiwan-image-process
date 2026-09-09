/**
 * 靈感中心（AI Inspiration Center）核心型別。
 * 產品定位：不是新聞牆／月度企劃／Calendar，而是「發現值得做的內容 → 一鍵帶入既有建立圖文流程」。
 */

/** 四種內容機會（第五節）。 */
export type OpportunityType = "trend" | "upcoming" | "reuse" | "gap";

/** 內容類型 tag（沿用 planner CONTENT_TYPE 精神，但擴充成靈感中心用的貼標）。 */
export type InspirationTag =
  | "seasonal" // 季節時事
  | "holiday" // 節日行銷
  | "product" // 產品應用
  | "knowledge" // 知識教育
  | "lifestyle" // 生活風格
  | "engagement" // 互動話題
  | "brand"; // 品牌

/** 建議帶入的產品（label + 圖），對應既有 CampaignProduct / library 產品圖。 */
export type RecommendedProduct = {
  label: string;
  imageUrl?: string | null;
};

/** 一則「內容機會」卡（今天有 X 個內容機會）。 */
export type Opportunity = {
  id: string;
  type: OpportunityType;
  /** 機會標題，例：入秋換季保養。 */
  title: string;
  /** Why Now：為何現在值得做。 */
  whyNow: string;
  /** 品牌適配度 0–100（AI 估算的相關性分數，非互動成效）。 */
  brandFit?: number;
  /** 建議帶入產品（可為 null＝不綁產品）。 */
  recommendedProduct?: RecommendedProduct | null;
  /** AI 建議切角（一句）。 */
  suggestedAngle?: string;
  /** 內容類型 tag。 */
  tag?: InspirationTag;
  /** 建議格式：單圖 or 輪播。 */
  suggestedFormat?: "single" | "carousel";
  /** CTA 文案，例：看看 AI 怎麼切入 →。 */
  cta?: string;
  /** reuse 型專用：對應的舊活動 id（點「再次使用」帶入）。 */
  reuseActivityId?: string;
  /** reuse 型專用：質化說明（例：去年同期做過），不使用捏造的互動數據。 */
  reuseNote?: string;
  /** gap 型專用：內容缺口說明（例：最近 8 篇有 5 篇是產品介紹）。 */
  gapNote?: string;
  /** 這張卡是憑什麼資料來的（例：IG 近三個月討論 / 台灣 9 月季節脈絡）。
   *  外部訊號來源可能失效（額度用盡、訂閱到期），而 provider 設計是「失敗回空、不阻斷」，
   *  沒有這行使用者無從分辨「真的有熱度」還是「只是當季常青題」。 */
  sourceLabel?: string;
  /** 覆寫徽章文字。用於誠實降級：沒有真實社群訊號時，trend 卡不該叫「正在升溫」。 */
  typeLabel?: string;
};

/** 一則「為你推薦的靈感」卡（第七節）。 */
export type Recommendation = {
  id: string;
  title: string;
  description: string;
  tag: InspirationTag;
  imageUrl?: string | null;
  recommendedProduct?: RecommendedProduct | null;
  suggestedFormat: "single" | "carousel";
  /** 文案方向（帶入 brief）。 */
  copyDirection?: string;
  /** 畫面方向（帶入 brief）。 */
  visualDirection?: string;
  /** 趨勢／來源背景（帶入 brief）。 */
  trendContext?: string;
};

/** 一個 Topic 展開的多種切角（第九節）。 */
export type ContentAngle = {
  /** 切角類型標籤，例：知識型／產品型／Lifestyle／互動型／促銷型。 */
  type: string;
  title: string;
  /** 文案方向，帶入 brief。 */
  copyDirection?: string;
};

/** /api/inspiration 回傳。 */
export type InspirationResult = {
  opportunities: Opportunity[];
  recommendations: Recommendation[];
  meta: {
    hasBrand: boolean;
    hasProduct: boolean;
    signalCount: number;
    /** 提示前端要顯示哪種 empty-state 引導（第二十節）。 */
    needBrandSetup: boolean;
    needProduct: boolean;
  };
};

/** 一則 inspiration/angle 轉成的建立圖文 Brief（第八節）。 */
export type InspirationBrief = {
  sourceType: "inspiration";
  clientId: string;
  topic: string;
  tag?: InspirationTag;
  suggestedFormat: "single" | "carousel";
  recommendedProduct?: RecommendedProduct | null;
  copyDirection?: string;
  visualDirection?: string;
  trendContext?: string;
  /** 若這是「再次使用」舊活動，帶原活動 id。 */
  reuseActivityId?: string;
};

export const TAG_META: Record<InspirationTag, { label: string; color: string }> = {
  seasonal: { label: "季節時事", color: "amber" },
  holiday: { label: "節日行銷", color: "rose" },
  product: { label: "產品應用", color: "blue" },
  knowledge: { label: "知識教育", color: "emerald" },
  lifestyle: { label: "生活風格", color: "violet" },
  engagement: { label: "互動話題", color: "fuchsia" },
  brand: { label: "品牌", color: "slate" },
};

export const OPPORTUNITY_META: Record<
  OpportunityType,
  { label: string; badgeClass: string; quoteClass: string; markClass: string }
> = {
  trend: { label: "正在升溫", badgeClass: "bg-rose-50 text-rose-600 border-rose-200", quoteClass: "border-rose-100 bg-rose-50/70 text-rose-700", markClass: "text-rose-300" },
  upcoming: { label: "近期值得準備", badgeClass: "bg-amber-50 text-amber-700 border-amber-200", quoteClass: "border-amber-100 bg-amber-50/70 text-amber-800", markClass: "text-amber-300" },
  reuse: { label: "你可以重新利用", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200", quoteClass: "border-emerald-100 bg-emerald-50/70 text-emerald-700", markClass: "text-emerald-300" },
  gap: { label: "品牌內容缺口", badgeClass: "bg-violet-50 text-violet-700 border-violet-200", quoteClass: "border-violet-100 bg-violet-50/70 text-violet-700", markClass: "text-violet-300" },
};

export const INSPIRATION_TAGS: InspirationTag[] = [
  "seasonal",
  "holiday",
  "product",
  "knowledge",
  "lifestyle",
  "engagement",
];
