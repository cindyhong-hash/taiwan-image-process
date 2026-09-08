// [PRODUCT] 產品相關的共用常數（前端）

export const PRODUCT_CATEGORIES = [
  "保養",
  "彩妝",
  "香氛",
  "3C 電子",
  "食品飲料",
  "服飾配件",
  "居家生活",
  "其他",
] as const;

// 核心套圖角色（完整度儀表以此計算「N/5」；對應 buildImageSetSuggestions 的建議清單）
export const CORE_SET_ROLES = ["hero", "detail", "background", "benefit", "decoration"];

// 先前已存的套圖用 lifestyle／texture／ingredient。它們各自對應到新版
// 「賣點視覺」與「質地細節」的完成度槽位，避免既有完整套圖在 UI 退回 4/5。
const CORE_SET_ROLE_ALIASES: Record<(typeof CORE_SET_ROLES)[number], readonly string[]> = {
  hero: ["hero"],
  detail: ["detail", "texture"],
  background: ["background"],
  benefit: ["benefit", "lifestyle", "ingredient"],
  decoration: ["decoration"],
};

export function imageSetCompleteness(presentRoles: ReadonlySet<string>) {
  const missingRoles = CORE_SET_ROLES.filter((role) => !CORE_SET_ROLE_ALIASES[role].some((alias) => presentRoles.has(alias)));
  return { doneCount: CORE_SET_ROLES.length - missingRoles.length, missingRoles };
}

// 套圖積木角色 → 使用者可見標籤（產品詳情頁分區用）
export const ASSET_ROLE_LABELS: Record<string, string> = {
  hero: "商品主體",
  product: "去背產品",
  detail: "質地細節",
  texture: "質地（舊素材）",
  ingredient: "成分（舊素材）",
  lifestyle: "使用情境（舊素材）",
  background: "情境背景",
  benefit: "賣點視覺",
  decoration: "裝飾元素",
  finished: "成品",
};

export type ProductAsset = {
  id: string;
  imageUrl: string;
  assetRole: string | null;
  status: string;
  createdAt: string;
};

export type Product = {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  category: string | null;
  rawImageUrls: string[];
  heroImageUrl: string | null;
  primaryColorOverride: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { assets: number };
  assets?: ProductAsset[];
  heroWarning?: string | null;
};
