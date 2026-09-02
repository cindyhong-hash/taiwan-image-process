import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 側欄「內容日曆」捷徑：導向該品牌「最近一份企劃」的內容日曆；
 * 沒有任何企劃時退回月度企劃首頁。避免使用者從 Home → 企劃 → ② → 日曆一路點。
 */
export default async function CalendarShortcut({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const latest = await db.monthlyMarketingPlan.findFirst({
    where: { clientId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { id: true },
  });
  redirect(latest ? `/clients/${clientId}/marketing-plans/${latest.id}/calendar` : `/clients/${clientId}/marketing-plans`);
}
