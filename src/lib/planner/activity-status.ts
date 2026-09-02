export type PlannerItemStatus = "DRAFT" | "GENERATING" | "NEEDS_REVIEW";

export function plannerStatusForActivity(activityStatus: string): PlannerItemStatus | null {
  switch (activityStatus) {
    case "DRAFT":
    case "FAILED":
      return "DRAFT";
    case "PENDING":
    case "GENERATING":
      return "GENERATING";
    case "DONE":
      return "NEEDS_REVIEW";
    default:
      return null;
  }
}
