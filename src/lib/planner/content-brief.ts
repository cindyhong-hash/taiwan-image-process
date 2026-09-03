export type BriefSignal = { id: string; source: string; label: string; score?: number };
export type BriefProduct = { id: string; label: string; imageUrl: string };
export type BriefCampaign = { id: string; name: string; description: string; products: BriefProduct[] };

export type BriefSourceItem = {
  id: string;
  topic: string;
  contentDirection: string;
  campaignId: string | null;
  format: string;
  platforms: string[];
  recommendationReason: string;
  sourceSignals: BriefSignal[];
  status?: string;
  generatedActivityId?: string | null;
};

export type ContentBrief = {
  itemId: string;
  campaignId: string | null;
  campaignName: string;
  campaignDescription: string;
  topic: string;
  contentDirection: string;
  format: "SINGLE" | "CAROUSEL";
  platforms: string[];
  products: BriefProduct[];
  recommendationReason: string;
  sourceSignals: BriefSignal[];
};

const ALLOWED_PLATFORMS = new Set(["Instagram", "Facebook"]);

export function buildContentBrief(item: BriefSourceItem, campaigns: BriefCampaign[]): ContentBrief {
  const campaign = campaigns.find((candidate) => candidate.id === item.campaignId);
  return {
    itemId: item.id,
    campaignId: campaign?.id ?? item.campaignId,
    campaignName: campaign?.name ?? "未指定 Campaign",
    campaignDescription: campaign?.description ?? "",
    topic: item.topic,
    contentDirection: item.contentDirection,
    format: item.format === "CAROUSEL" ? "CAROUSEL" : "SINGLE",
    platforms: [...new Set(item.platforms.filter((platform) => ALLOWED_PLATFORMS.has(platform)))],
    products: campaign?.products ?? [],
    recommendationReason: item.recommendationReason,
    sourceSignals: item.sourceSignals,
  };
}

// AI 在 handoff 時先想好的整份創意 brief（單圖：主標/副標/畫面；多圖：另含逐頁拆解）
export type CreativeBrief = {
  headline?: string;
  subtitle?: string;
  visual?: string;
  slides?: { text: string; visual: string }[];
};

export type PlannerActivityDraft = {
  theme: string;
  focusPoint: string;
  titleText: string;
  subtitleText: string | null;
  imagePrompt: string;
  productImageUrl: string;
  productImageUrls: string;
  referenceImageUrls: string;
  selectedComponentIds: string;
  layoutId: string;
  genMode: "unified" | "perCell";
  cells: string;
  status: "DRAFT";
};

export function buildPlannerActivityDraft(brief: ContentBrief, creative?: CreativeBrief): PlannerActivityDraft {
  const productUrls = brief.products.map((product) => product.imageUrl).filter(Boolean);
  const isCarousel = brief.format === "CAROUSEL";
  const hasSlides = isCarousel && !!creative?.slides?.length;

  // 圖上文字：優先用 AI 想好的主標/副標，退回主題。編成「主標題：X 副標題：Y」讓既有生圖流程鎖定沿用。
  const headline = (creative?.headline ?? "").trim() || brief.topic;
  const subtitle = (creative?.subtitle ?? "").trim();
  const titleText = subtitle ? `主標題：${headline} 副標題：${subtitle}` : headline;

  // 畫面描述：優先用 AI 想好的 visual，退回內容方向（＋ Campaign 補充）
  const promptParts = [(creative?.visual ?? "").trim() || brief.contentDirection.trim()];
  if (brief.campaignDescription.trim()) promptParts.push(`Campaign 補充：${brief.campaignDescription.trim()}`);

  return {
    theme: brief.topic.slice(0, 30) || "未命名活動",
    focusPoint: brief.topic,
    titleText,
    subtitleText: subtitle || null,
    imagePrompt: promptParts.filter(Boolean).join("\n\n"),
    productImageUrl: productUrls[0] ?? "",
    productImageUrls: JSON.stringify(productUrls),
    referenceImageUrls: "[]",
    selectedComponentIds: "[]",
    layoutId: isCarousel ? "three-h-top" : "single",
    // 多圖有逐頁拆解 → perCell（吃每頁內容）；否則 unified
    genMode: hasSlides ? "perCell" : "unified",
    cells: hasSlides
      ? JSON.stringify(creative!.slides!.map((s) => ({ description: (s.visual ?? "").trim(), mustText: (s.text ?? "").trim(), assetUrls: [] })))
      : "[]",
    status: "DRAFT",
  };
}

export function plannerActivityDestination(clientId: string, activityId: string, format: string): string {
  return format === "CAROUSEL"
    ? `/clients/${clientId}/activities/new/multi?edit=${activityId}`
    : `/clients/${clientId}/activities/${activityId}/edit`;
}
