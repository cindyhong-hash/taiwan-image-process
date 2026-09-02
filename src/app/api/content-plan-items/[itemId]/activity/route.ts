import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildContentBrief, buildPlannerActivityDraft } from "@/lib/planner/content-brief";
import { parseJsonArray, parseJsonArrayAny } from "@/lib/marketing-planner";

export async function POST(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  try {
    const result = await db.$transaction(async (tx) => {
      const item = await tx.contentPlanItem.findUnique({
        where: { id: itemId },
        include: {
          monthlyPlan: { select: { clientId: true } },
          campaign: { include: { products: true } },
          generatedActivity: { select: { id: true } },
        },
      });
      if (!item) return null;
      if (item.generatedActivity) {
        return { activityId: item.generatedActivity.id, clientId: item.monthlyPlan.clientId, format: item.format, reused: true };
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
      const activity = await tx.activity.create({
        data: { clientId: item.monthlyPlan.clientId, ...buildPlannerActivityDraft(brief) },
      });
      await tx.contentPlanItem.update({ where: { id: item.id }, data: { generatedActivityId: activity.id, status: "DRAFT" } });
      await tx.monthlyMarketingPlan.update({ where: { id: item.monthlyPlanId }, data: { status: "GENERATION_READY" } });
      return { activityId: activity.id, clientId: item.monthlyPlan.clientId, format: item.format, reused: false };
    });
    if (!result) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "建立 Activity 失敗" }, { status: 500 });
  }
}
