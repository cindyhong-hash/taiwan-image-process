import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PlannerCalendarView } from "@/components/marketing-planner/PlannerCalendarView";

export const dynamic = "force-dynamic";

export default async function MarketingPlanCalendarPage({ params }: { params: Promise<{ clientId: string; planId: string }> }) {
  const { clientId, planId } = await params;
  const plan = await db.monthlyMarketingPlan.findFirst({
    where: { id: planId, clientId },
    include: { contentItems: { include: { campaign: { select: { name: true } } }, orderBy: { sortOrder: "asc" } } },
  });
  if (!plan) notFound();
  return <PlannerCalendarView planId={planId} clientId={clientId} year={plan.year} month={plan.month}
    initialTopics={plan.contentItems.map((item) => ({ ...item, scheduledDate: item.scheduledDate?.toISOString() ?? null }))} />;
}
