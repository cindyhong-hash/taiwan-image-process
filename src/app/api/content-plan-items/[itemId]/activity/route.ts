import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildContentBrief, buildPlannerActivityDraft } from "@/lib/planner/content-brief";
import { generateCreativeBrief } from "@/lib/planner/creative-brief";
import { describeProduct } from "@/lib/fal";
import { parseJsonArray, parseJsonArrayAny } from "@/lib/marketing-planner";

export async function POST(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  try {
    const item = await db.contentPlanItem.findUnique({
      where: { id: itemId },
      include: {
        monthlyPlan: { select: { clientId: true, client: { select: { name: true, description: true, industry: true, toneLabels: true } } } },
        campaign: { include: { products: true } },
        generatedActivity: { select: { id: true } },
      },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (item.generatedActivity) {
      return NextResponse.json({ activityId: item.generatedActivity.id, clientId: item.monthlyPlan.clientId, format: item.format, reused: true }, { status: 200 });
    }

    const campaigns = item.campaign ? [{
      id: item.campaign.id,
      name: item.campaign.name,
      description: item.campaign.description,
      products: item.campaign.products.map((product) => ({ id: product.id, label: product.label, imageUrl: product.imageUrl })),
    }] : [];
    const brief = buildContentBrief({
      id: item.id,
      topic: item.topic,
      contentDirection: item.contentDirection,
      campaignId: item.campaignId,
      format: item.format,
      platforms: parseJsonArray(item.platforms),
      recommendationReason: item.recommendationReason,
      sourceSignals: parseJsonArrayAny(item.sourceSignals),
    }, campaigns);

    // 先用產品實圖分析出客觀描述,餵給創意 brief,避免畫面誤解產品類別(如女刀被寫成料理食材)。失敗回 null 不阻斷。
    const productImageUrl = brief.products.map((p) => p.imageUrl).find(Boolean);
    const productDesc = productImageUrl ? await describeProduct(productImageUrl).catch(() => null) : null;

    // handoff 時先想好整份創意 brief(主標/副標/畫面;多圖拆頁)→ 預填編輯器。失敗回 {} 不阻斷。
    const creative = await generateCreativeBrief({
      format: brief.format,
      topic: item.topic,
      contentDirection: item.contentDirection,
      campaignName: brief.campaignName,
      campaignDescription: brief.campaignDescription,
      productLabels: brief.products.map((p) => p.label),
      brandName: item.monthlyPlan.client.name,
      brandDescription: item.monthlyPlan.client.description,
      industry: item.monthlyPlan.client.industry,
      platforms: brief.platforms,
      productDesc,
      toneLabels: parseJsonArray(item.monthlyPlan.client.toneLabels),
    }).catch(() => ({}));

    const activity = await db.activity.create({
      data: { clientId: item.monthlyPlan.clientId, ...buildPlannerActivityDraft(brief, creative) },
    });
    await db.$transaction([
      db.contentPlanItem.update({ where: { id: item.id }, data: { generatedActivityId: activity.id, status: "DRAFT" } }),
      db.monthlyMarketingPlan.update({ where: { id: item.monthlyPlanId }, data: { status: "GENERATION_READY" } }),
    ]);
    return NextResponse.json({ activityId: activity.id, clientId: item.monthlyPlan.clientId, format: item.format, reused: false }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "建立 Activity 失敗" }, { status: 500 });
  }
}
