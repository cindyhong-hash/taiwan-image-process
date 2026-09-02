type ContextProduct = { id: string; label: string; imageUrl: string };
type ContextImportantDate = { date: Date; label: string };
type ContextCampaign = {
  id: string;
  name: string;
  goals: string;
  description: string;
  importantDates: ContextImportantDate[];
  products: ContextProduct[];
};

export type PlannerContextInput = {
  client: {
    name: string;
    description: string | null;
    industry: string | null;
    toneLabels: string;
  };
  campaigns: ContextCampaign[];
};

function parseStrings(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export const PLANNER_GROUNDING_RULES = [
  "不得僅從品牌名稱猜測產品類別或用途。",
  "不得創造未提供的產品、功能、材質、適用族群或使用情境。",
  "產品資訊不足時，只能規劃通用品牌或互動內容，不得生成具體產品主題。",
].join(" ");

export function hasUsableCampaignProducts(campaigns: ContextCampaign[]): boolean {
  return campaigns.some((campaign) => campaign.products.length > 0);
}

const GENERIC_PRODUCT_LABEL = /^(?:產品|商品|未命名|product)(?:\s*[-#]?\s*\d+)?$/i;

export function productsNeedingImageAnalysis(campaigns: ContextCampaign[]) {
  return campaigns.flatMap((campaign) => campaign.products)
    .filter((product) => Boolean(product.imageUrl) && GENERIC_PRODUCT_LABEL.test(product.label.trim()))
    .map((product) => ({ id: product.id, imageUrl: product.imageUrl }));
}

type StrategyWithMix = {
  contentMix: { type: string; count: number; reason?: string }[];
};

export function groundStrategyWithoutProducts<T extends StrategyWithMix>(strategy: T, hasProducts: boolean): T {
  if (hasProducts) return strategy;
  const productCount = strategy.contentMix.find((item) => item.type === "PRODUCT")?.count ?? 0;
  if (productCount === 0) return strategy;
  return {
    ...strategy,
    contentMix: strategy.contentMix.map((item) => {
      if (item.type === "PRODUCT") return { ...item, count: 0, reason: "尚未提供可依據的產品資料" };
      if (item.type === "ENGAGEMENT") return { ...item, count: item.count + productCount };
      return item;
    }),
  };
}

const PRODUCT_CLAIM_PATTERN = /產品|商品|材質|功能|用途|使用|適用|穿搭|搭配|料理|烹飪|切割|刀具|除毛|刮毛|當季推薦|購買|入手/;

export const NO_PRODUCT_TOPIC_TEMPLATES: Record<string, string[]> = {
  BRAND: ["品牌理念：我們在乎的日常細節", "品牌故事：從需求出發的設計", "本月品牌關鍵字"],
  EDUCATION: ["品牌觀點：本月值得關注的生活議題", "從日常需求聊起", "品牌價值小教室"],
  ENGAGEMENT: ["你是哪一派？留言告訴我們", "本月 Q&A 小教室", "分享你心中的理想日常"],
  PROMOTION: ["本月品牌動態預告", "追蹤本月最新消息", "會員互動活動提醒"],
};

export function hasUngroundedProductClaim(topic: { contentType?: string; topic?: string; contentDirection?: string }): boolean {
  if (topic.contentType === "PRODUCT") return true;
  return PRODUCT_CLAIM_PATTERN.test(`${topic.topic ?? ""} ${topic.contentDirection ?? ""}`);
}

export function buildPlannerContext(input: PlannerContextInput, imageAnalyses = new Map<string, string>()) {
  return {
    brand: {
      name: input.client.name,
      description: input.client.description ?? "",
      industry: input.client.industry ?? "",
      toneLabels: parseStrings(input.client.toneLabels),
    },
    campaigns: input.campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      goals: parseStrings(campaign.goals),
      description: campaign.description,
      importantDates: campaign.importantDates.map((item) => ({
        date: item.date.toISOString().slice(0, 10),
        label: item.label,
      })),
      products: campaign.products.map((product) => ({
        id: product.id,
        label: product.label,
        imageAnalysis: imageAnalyses.get(product.id) ?? "",
      })),
    })),
    groundingRules: PLANNER_GROUNDING_RULES,
  };
}
