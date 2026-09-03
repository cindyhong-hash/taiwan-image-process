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

// 套圖積木角色 → 使用者可見標籤（產品詳情頁分區用）
export const ASSET_ROLE_LABELS: Record<string, string> = {
  hero: "主視覺",
  product: "去背產品",
  texture: "質地",
  ingredient: "成分",
  background: "背景版",
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
