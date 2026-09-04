"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * 月度企劃入口 — 直接落在「當月企劃」(沒有就建立)，依進度落 Brief 或內容日曆。
 * 不再有企劃列表當落地頁;跨月份用 Brief/日曆標題旁的 ‹ › 與月份下拉切換。
 */
const PLANNED = new Set(["TOPICS_READY", "CALENDAR_READY", "GENERATION_READY", "REVIEW", "COMPLETED"]);

export default function MarketingPlansEntry({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    params.then(async ({ clientId }) => {
      const now = new Date();
      try {
        const res = await fetch(`/api/marketing-plans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, year: now.getFullYear(), month: now.getMonth() + 1 }),
        });
        const plan = await res.json();
        if (!alive || !plan?.id) return;
        // 已規劃(有主題/排程)→ 內容日曆;否則 → Brief(① 建立企劃)
        const suffix = PLANNED.has(plan.status) ? "/calendar" : "";
        router.replace(`/clients/${clientId}/marketing-plans/${plan.id}${suffix}`);
      } catch { /* 失敗就停在 loading，使用者可重新整理 */ }
    });
    return () => { alive = false; };
  }, [params, router]);

  return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
}
