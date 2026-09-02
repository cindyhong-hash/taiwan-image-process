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

export type PlannerActivityDraft = {
  theme: string;
  focusPoint: string;
  titleText: string;
  imagePrompt: string;
  productImageUrl: string;
  productImageUrls: string;
  referenceImageUrls: string;
  selectedComponentIds: string;
  layoutId: string;
  genMode: "unified";
  cells: string;
  status: "DRAFT";
};

export function buildPlannerActivityDraft(brief: ContentBrief): PlannerActivityDraft {
  const productUrls = brief.products.map((product) => product.imageUrl).filter(Boolean);
  const promptParts = [brief.contentDirection.trim()];
  if (brief.campaignDescription.trim()) promptParts.push(`Campaign 補充：${brief.campaignDescription.trim()}`);
  return {
    theme: brief.topic.slice(0, 30) || "未命名活動",
    focusPoint: brief.topic,
    titleText: brief.topic,
    imagePrompt: promptParts.filter(Boolean).join("\n\n"),
    productImageUrl: productUrls[0] ?? "",
    productImageUrls: JSON.stringify(productUrls),
    referenceImageUrls: "[]",
    selectedComponentIds: "[]",
    layoutId: brief.format === "CAROUSEL" ? "three-h-top" : "single",
    genMode: "unified",
    cells: "[]",
    status: "DRAFT",
  };
}

export function plannerActivityDestination(clientId: string, activityId: string, format: string): string {
  return format === "CAROUSEL"
    ? `/clients/${clientId}/activities/new/multi?edit=${activityId}`
    : `/clients/${clientId}/activities/${activityId}/edit`;
}
