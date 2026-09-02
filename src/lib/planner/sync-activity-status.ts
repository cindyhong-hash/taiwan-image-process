import { db } from "@/lib/db";
import { plannerStatusForActivity } from "@/lib/planner/activity-status";

export async function syncPlannerItemStatus(activityId: string, activityStatus: string) {
  const status = plannerStatusForActivity(activityStatus);
  if (!status) return;

  const item = await db.contentPlanItem.findUnique({
    where: { generatedActivityId: activityId },
    select: { id: true, monthlyPlanId: true },
  });
  if (!item) return;

  await db.$transaction([
    db.contentPlanItem.update({ where: { id: item.id }, data: { status } }),
    ...(status === "NEEDS_REVIEW"
      ? [db.monthlyMarketingPlan.update({ where: { id: item.monthlyPlanId }, data: { status: "REVIEW" } })]
      : []),
  ]);
}
