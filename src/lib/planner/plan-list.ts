const PLAN_PROGRESS: Record<string, number> = {
  DRAFT: 10,
  STRATEGY_READY: 35,
  TOPICS_READY: 60,
  CALENDAR_READY: 75,
  GENERATION_READY: 85,
  REVIEW: 95,
  COMPLETED: 100,
};

export type PlanStatusGroup = "active" | "completed";

export function getPlanProgress(status: string): number {
  return PLAN_PROGRESS[status] ?? 10;
}

export function getPlanStatusGroup(status: string): PlanStatusGroup {
  return status === "COMPLETED" ? "completed" : "active";
}
