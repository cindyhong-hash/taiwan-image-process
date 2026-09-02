import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { serializePlan } from "@/lib/marketing-planner";
import { PlannerBriefEditor } from "@/components/marketing-planner/PlannerBriefEditor";

export const dynamic = "force-dynamic";

export default async function MarketingPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const plan = await db.monthlyMarketingPlan.findUnique({
    where: { id: planId },
    include: {
      client: { select: { id: true, name: true } },
      campaigns: { include: { products: true, importantDates: { orderBy: { date: "asc" } } }, orderBy: { sortOrder: "asc" } },
      _count: { select: { contentItems: true } },
    },
  });
  if (!plan) notFound();
  return <PlannerBriefEditor initialPlan={serializePlan(plan as unknown as Record<string, unknown>) as never} hasTopics={plan._count.contentItems > 0} />;
}
