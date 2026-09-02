"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * 建立月度企劃：建一份 DRAFT（預設當月、含一個主 Campaign），再導向 ① Brief 編輯頁。
 * 同月已存在時 API 會回傳既有企劃（不重複建立）。
 */
export default function NewMarketingPlanPage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    params.then(async ({ clientId }) => {
      const now = new Date();
      const res = await fetch("/api/marketing-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, year: now.getFullYear(), month: now.getMonth() + 1, totalPostCount: 12, goals: ["品牌曝光"], platforms: ["Instagram", "Facebook"] }),
      });
      const plan = await res.json();
      if (plan?.id) router.replace(`/clients/${clientId}/marketing-plans/${plan.id}`);
      else router.replace(`/clients/${clientId}/marketing-plans`);
    });
  }, [params, router]);
  return <div className="flex h-64 items-center justify-center text-gray-400">正在建立月度企劃…</div>;
}
