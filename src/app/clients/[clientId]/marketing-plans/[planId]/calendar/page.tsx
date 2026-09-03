import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PlannerCalendarView } from "@/components/marketing-planner/PlannerCalendarView";
import { parseJsonArray, parseJsonArrayAny } from "@/lib/marketing-planner";

export const dynamic = "force-dynamic";

export default async function MarketingPlanCalendarPage({ params }: { params: Promise<{ clientId: string; planId: string }> }) {
  const { clientId, planId } = await params;
  const plan = await db.monthlyMarketingPlan.findFirst({
    where: { id: planId, clientId },
    include: {
      campaigns: { include: { products: true }, orderBy: { sortOrder: "asc" } },
      contentItems: {
        include: {
          campaign: { select: { name: true } },
          // 核准選定的成品圖：優先取 isSelected 那張，退回第一張，讓日曆卡片顯示縮圖
          generatedActivity: { select: { generatedLayouts: { select: { imageUrl: true, isSelected: true } } } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!plan) notFound();
  return <PlannerCalendarView planId={planId} clientId={clientId} year={plan.year} month={plan.month}
    campaigns={plan.campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name, description: campaign.description, products: campaign.products.map((product) => ({ id: product.id, label: product.label, imageUrl: product.imageUrl })) }))}
    initialTopics={plan.contentItems.map((item) => {
      const layouts = item.generatedActivity?.generatedLayouts ?? [];
      const previewImageUrl = (layouts.find((l) => l.isSelected) ?? layouts[0])?.imageUrl || null;
      return { ...item, platforms: parseJsonArray(item.platforms), sourceSignals: parseJsonArrayAny(item.sourceSignals), scheduledDate: item.scheduledDate?.toISOString() ?? null, previewImageUrl };
    })} />;
}
