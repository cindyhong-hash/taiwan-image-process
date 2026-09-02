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
