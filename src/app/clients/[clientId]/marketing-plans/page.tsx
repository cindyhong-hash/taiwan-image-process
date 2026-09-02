"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronRight, Plus } from "lucide-react";

/**
 * Planner Home — 月度企劃清單（Flow A 入口）。
 * 不直接進 Brief；先看清單 + 建立。完整流程見 docs/monthly-planner-flow-A-spec.md。
 */
type Plan = {
  id: string; year: number; month: number; goals: string[]; totalPostCount: number;
  platforms: string[]; status: string; updatedAt: string;
  _count: { campaigns: number; contentItems: number };
};

const statusMeta: Record<string, { label: string; done?: boolean }> = {
  DRAFT: { label: "規劃中" },
  STRATEGY_READY: { label: "策略完成" },
  TOPICS_READY: { label: "Topics 完成" },
  CALENDAR_READY: { label: "已排程" },
  GENERATION_READY: { label: "製作中" },
  REVIEW: { label: "審核中" },
  COMPLETED: { label: "已完成", done: true },
};

export default function MarketingPlansHome({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    params.then(({ clientId }) => {
      setClientId(clientId);
      fetch(`/api/marketing-plans?clientId=${clientId}`).then((r) => r.json()).then(setPlans).catch(() => setPlans([]));
    });
  }, [params]);

  const createPlan = async () => {
    if (!clientId || creating) return;
    setCreating(true);
    router.push(`/clients/${clientId}/marketing-plans/new`);
  };

  if (!clientId || plans === null) return <div className="text-gray-400">載入中…</div>;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">月度企劃</h1>
          <p className="mt-1 text-sm text-gray-400">準備好規劃這個月的內容了嗎？先設定目標與 Campaign，AI 幫你排好整月內容。</p>
        </div>
        {plans.length > 0 && (
          <button onClick={createPlan} disabled={creating}
            className="flex items-center gap-1.5 text-sm font-medium bg-violet-600 text-white px-4 py-2.5 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-60">
            <Plus className="h-4 w-4" />建立月度企劃
          </button>
        )}
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
            <CalendarRange className="h-6 w-6 text-violet-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800">還沒有月度企劃</h2>
          <p className="max-w-md text-sm text-gray-500">建立第一份企劃，統一管理本月目標、Campaign、內容組合與內容日曆。</p>
          <button onClick={createPlan} disabled={creating}
            className="mt-2 inline-flex items-center gap-1.5 bg-violet-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-60">
            <Plus className="h-4 w-4" />建立月度企劃
          </button>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">最近企劃</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const meta = statusMeta[plan.status] ?? { label: plan.status };
              return (
                <Link key={plan.id} href={`/clients/${clientId}/marketing-plans/${plan.id}`}
                  className="group rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-violet-300 hover:shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                      <CalendarRange className="h-5 w-5" />
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{meta.label}</span>
                  </div>
                  <h3 className="mt-4 font-semibold text-gray-900">{plan.year} 年 {plan.month} 月社群內容企劃</h3>
                  <p className="mt-2 line-clamp-1 text-xs text-gray-500">{plan.goals.join("、") || "尚未設定行銷目標"}</p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-400">
                    <span>{plan.totalPostCount} 篇內容</span>
                    <span>{plan._count.campaigns} Campaign</span>
                    {plan.platforms.length > 0 && <span>{plan.platforms.join(" / ")}</span>}
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t pt-3 text-xs font-medium text-violet-600">
                    <span>{meta.done ? "查看企劃" : "繼續規劃"}</span>
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
