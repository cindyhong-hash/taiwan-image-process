"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarRange, ChevronRight, Plus, Sparkles } from "lucide-react";

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

  if (plans.length === 0) {
    const steps = [
      ["01", "設定本月目標", "決定品牌曝光、導購或互動等本月重點"],
      ["02", "建立 Campaign", "整理產品、活動資訊與重要日期"],
      ["03", "取得 AI 內容策略", "依目標分配整月內容組合與節奏"],
      ["04", "完成 Topics 與內容日曆", "產生主題並安排整月發布日期"],
    ];
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="grid overflow-hidden rounded-2xl border border-[#ebeff5] bg-white lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold text-violet-600">AI 月度企劃</p>
            <h1 className="mt-3 text-balance text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">開始規劃這個月的社群內容</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-gray-500">設定目標、Campaign 與產品資訊，AI 會協助你完成內容策略、Topics 與整月排程。</p>
          </div>
          <div className="flex min-h-64 items-center justify-center bg-gradient-to-br from-[#faf8ff] via-white to-[#fff8f2] p-5 sm:p-8">
            <Image src="/images/monthly-planner-empty.jpg" alt="AI 月度企劃內容日曆示意圖" width={1080} height={576} priority className="h-auto w-full max-w-2xl rounded-xl object-contain" />
          </div>
        </section>

        <section className="rounded-2xl border border-[#ebeff5] bg-white p-7 sm:p-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">月度企劃會怎麼進行？</h2>
            <p className="mt-1 text-sm text-gray-400">跟著四個步驟，一步步完成整月內容規劃。</p>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {steps.map(([number, title, description]) => (
              <div key={number} className="flex gap-3 rounded-xl border border-[#ebeff5] p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">{number}</span>
                <div><h3 className="text-sm font-bold text-gray-900">{title}</h3><p className="mt-1 text-xs leading-5 text-gray-400">{description}</p></div>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center pt-8">
            <button onClick={createPlan} disabled={creating} className="inline-flex h-auto items-center justify-center gap-2 rounded-full bg-violet-600 px-12 py-4 text-base font-bold text-white shadow-[0_8px_8px_rgba(124,58,237,0.15)] transition-colors hover:bg-violet-700 disabled:opacity-50 sm:px-16">
              <Sparkles className="h-[18px] w-[18px]" />開始建立月度企劃<ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">月度企劃</h1>
          <p className="mt-1 text-sm text-gray-400">準備好規劃這個月的內容了嗎？先設定目標與 Campaign，AI 幫你排好整月內容。</p>
        </div>
        <button onClick={createPlan} disabled={creating}
          className="flex items-center gap-1.5 text-sm font-medium bg-violet-600 text-white px-4 py-2.5 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-60">
          <Plus className="h-4 w-4" />建立月度企劃
        </button>
      </div>

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
    </div>
  );
}
