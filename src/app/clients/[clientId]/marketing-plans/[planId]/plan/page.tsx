import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseJsonObject, serializePlan, type PlannerStrategy } from "@/lib/marketing-planner";
import { PlannerStrategyView } from "@/components/marketing-planner/PlannerStrategyView";

export const dynamic = "force-dynamic";

export default async function MarketingPlanStrategyPage({ params }: { params: Promise<{ clientId: string; planId: string }> }) {
  const { clientId, planId } = await params;
  const plan = await db.monthlyMarketingPlan.findUnique({
    where: { id: planId },
    include: {
      campaigns: { orderBy: { sortOrder: "asc" } },
      contentItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!plan) notFound();
  const serialized = serializePlan(plan as unknown as Record<string, unknown>) as never as {
    totalPostCount: number;
    campaigns: { id: string; name: string }[];
    contentItems: never[];
    strategyJson: unknown;
  };
  const strategy = parseJsonObject<PlannerStrategy>(serialized.strategyJson, {} as PlannerStrategy);
  return (
    <PlannerStrategyView
      planId={planId}
      clientId={clientId}
      total={serialized.totalPostCount}
      campaigns={serialized.campaigns.map((c) => ({ id: c.id, name: c.name }))}
      initialStrategy={strategy}
      initialTopics={serialized.contentItems}
    />
  );
}
