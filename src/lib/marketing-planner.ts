export const MARKETING_GOALS = ["品牌曝光", "新品上市", "導購轉換", "會員經營", "活動宣傳", "互動成長", "其他"] as const;
export const MARKETING_PLATFORMS = ["Instagram", "Facebook"] as const;
export const CONTENT_TYPES = ["BRAND", "EDUCATION", "PRODUCT", "ENGAGEMENT", "PROMOTION"] as const;
export const CONTENT_TYPE_META = {
  BRAND: { label: "品牌曝光", hint: "建立認知", color: "rose" },
  EDUCATION: { label: "知識教育", hint: "教育需求", color: "amber" },
  PRODUCT: { label: "產品介紹", hint: "強化理解", color: "blue" },
  ENGAGEMENT: { label: "互動內容", hint: "提升互動", color: "violet" },
  PROMOTION: { label: "促銷轉換", hint: "推動轉換", color: "emerald" },
} as const;
export type ContentType = typeof CONTENT_TYPES[number];
export type PlannerStrategy = {
  summary: string;
  contentMix: { type: ContentType; count: number; reason?: string }[];
  campaignAllocations: { campaignId: string; count: number; contentMix: Partial<Record<ContentType, number>> }[];
};

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  try { const parsed = JSON.parse(String(value ?? "[]")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

/** 解析 JSON array（允許物件元素，不像 parseJsonArray 只留字串）。給 sourceSignals 用。 */
export function parseJsonArrayAny<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  try { const parsed = JSON.parse(String(value ?? "[]")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export function parseJsonObject<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  try { const parsed = JSON.parse(String(value ?? "{}")); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : fallback; } catch { return fallback; }
}

function exactCounts(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => total * w / sum);
  const result = raw.map(Math.floor);
  let left = total - result.reduce((a, b) => a + b, 0);
  raw.map((v, i) => ({ i, remainder: v - result[i] })).sort((a, b) => b.remainder - a.remainder).forEach(({ i }) => { if (left-- > 0) result[i] += 1; });
  return result;
}

export function createFallbackStrategy(total: number, goals: string[], campaigns: { id: string; goals?: string[] }[]): PlannerStrategy {
  const weights = [20, 24, 24, 12, 20];
  if (goals.includes("品牌曝光")) weights[0] += 12;
  if (goals.includes("新品上市")) weights[2] += 12;
  if (goals.includes("導購轉換")) weights[4] += 14;
  if (goals.includes("互動成長") || goals.includes("會員經營")) weights[3] += 12;
  const mixCounts = exactCounts(total, weights);
  const campaignCounts = exactCounts(total, campaigns.map((c) => 1 + (c.goals?.length ?? 0) * .12));
  return {
    summary: `依照本月「${goals.join("、") || "綜合行銷"}」目標，兼顧品牌累積、內容教育與轉換節奏。`,
    contentMix: CONTENT_TYPES.map((type, i) => ({ type, count: mixCounts[i], reason: CONTENT_TYPE_META[type].hint })),
    campaignAllocations: campaigns.map((campaign, i) => ({ campaignId: campaign.id, count: campaignCounts[i], contentMix: {} })),
  };
}

export function normalizeStrategy(value: unknown, total: number, goals: string[], campaigns: { id: string; goals?: string[] }[]): PlannerStrategy {
  const fallback = createFallbackStrategy(total, goals, campaigns);
  const input = value && typeof value === "object" ? value as Partial<PlannerStrategy> : {};
  const mixMap = new Map((input.contentMix ?? []).map((x) => [x.type, Number(x.count) || 0]));
  const mixCounts = exactCounts(total, CONTENT_TYPES.map((type) => Math.max(0, mixMap.get(type) || fallback.contentMix.find((x) => x.type === type)!.count)));
  const allocationMap = new Map((input.campaignAllocations ?? []).map((x) => [x.campaignId, Number(x.count) || 0]));
  const allocationCounts = exactCounts(total, campaigns.map((c, i) => Math.max(0, allocationMap.get(c.id) || fallback.campaignAllocations[i].count)));
  return {
    summary: String(input.summary || fallback.summary),
    contentMix: CONTENT_TYPES.map((type, i) => ({ type, count: mixCounts[i], reason: input.contentMix?.find((x) => x.type === type)?.reason || CONTENT_TYPE_META[type].hint })),
    campaignAllocations: campaigns.map((campaign, i) => ({ campaignId: campaign.id, count: allocationCounts[i], contentMix: input.campaignAllocations?.find((x) => x.campaignId === campaign.id)?.contentMix ?? {} })),
  };
}

export function serializePlan<T extends Record<string, unknown>>(plan: T) {
  return {
    ...plan,
    goals: parseJsonArray(plan.goals),
    platforms: parseJsonArray(plan.platforms),
    strategyJson: parseJsonObject(plan.strategyJson, {}),
    campaigns: Array.isArray(plan.campaigns) ? plan.campaigns.map((campaign) => {
      const c = campaign as Record<string, unknown>;
      return { ...c, goals: parseJsonArray(c.goals), importantDates: Array.isArray(c.importantDates) ? c.importantDates.map((item) => { const important = item as Record<string, unknown>; return { ...important, date: important.date instanceof Date ? important.date.toISOString() : important.date }; }) : c.importantDates };
    }) : plan.campaigns,
    contentItems: Array.isArray(plan.contentItems) ? plan.contentItems.map((item) => {
      const content = item as Record<string, unknown>;
      return { ...content, platforms: parseJsonArray(content.platforms), sourceSignals: parseJsonArrayAny(content.sourceSignals), scheduledDate: content.scheduledDate instanceof Date ? content.scheduledDate.toISOString() : content.scheduledDate };
    }) : plan.contentItems,
  };
}

export function monthBounds(year: number, month: number) {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 0, 12)) };
}
