"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { getPlanProgress, getPlanStatusGroup } from "@/lib/planner/plan-list";

/**
 * Planner Home — 月度企劃清單（Flow A 入口）。
 * 不直接進 Brief；先看清單 + 建立。完整流程見 docs/monthly-planner-flow-A-spec.md。
 */
type Plan = {
  id: string; year: number; month: number; goals: string[]; totalPostCount: number;
  platforms: string[]; status: string; updatedAt: string;
  _count: { campaigns: number; contentItems: number };
};

const statusMeta: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "草稿", tone: "bg-amber-50 text-amber-700" },
  STRATEGY_READY: { label: "策略完成", tone: "bg-violet-50 text-violet-700" },
  TOPICS_READY: { label: "Topics 完成", tone: "bg-violet-50 text-violet-700" },
  CALENDAR_READY: { label: "已排程", tone: "bg-emerald-50 text-emerald-700" },
  GENERATION_READY: { label: "製作中", tone: "bg-blue-50 text-blue-700" },
  REVIEW: { label: "審核中", tone: "bg-orange-50 text-orange-700" },
  COMPLETED: { label: "已完成", tone: "bg-emerald-50 text-emerald-700" },
};

function planTitle(plan: Plan) {
  return `${plan.year} 年 ${plan.month} 月社群內容企劃`;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default function MarketingPlansHome({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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

  const requestDelete = (plan: Plan) => {
    setOpenMenuId(null);
    setDeleteError("");
    setDeleteTarget(plan);
  };

  const deletePlan = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/marketing-plans/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete failed");
      setPlans((current) => current?.filter((plan) => plan.id !== deleteTarget.id) ?? []);
      setDeleteTarget(null);
    } catch {
      setDeleteError("無法刪除企劃，請稍後再試。原有資料尚未變更。");
    } finally {
      setDeleting(false);
    }
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

  const totalContentCount = plans.reduce((sum, plan) => sum + plan.totalPostCount, 0);
  const completedCount = plans.filter((plan) => getPlanStatusGroup(plan.status) === "completed").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">月度企劃列表</h1>
          <p className="mt-1 text-sm text-gray-400">管理每個月的內容企劃，快速掌握規劃與製作進度。</p>
        </div>
        <button onClick={createPlan} disabled={creating}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_6px_12px_rgba(124,58,237,0.18)] transition-colors hover:bg-violet-700 disabled:opacity-60">
          <Plus className="h-4 w-4" />建立月度企劃
        </button>
      </div>

      <section aria-label="企劃摘要" className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "企劃總數", value: `${plans.length}`, suffix: "份", icon: CalendarRange },
          { label: "規劃內容", value: `${totalContentCount}`, suffix: "篇", icon: FileText },
          { label: "已完成企劃", value: `${completedCount}`, suffix: "份", icon: CheckCircle2 },
        ].map(({ label, value, suffix, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-[#ebeff5] bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{label}</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Icon className="h-[18px] w-[18px]" /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{value}<span className="ml-1 text-sm font-medium text-gray-400">{suffix}</span></p>
          </div>
        ))}
      </section>

      <section className="overflow-visible rounded-2xl border border-[#ebeff5] bg-white">
        <div className="border-b border-[#ebeff5] px-5 py-4 sm:px-6">
          <h2 className="text-base font-bold text-gray-900">所有企劃</h2>
          <p className="mt-0.5 text-xs text-gray-400">依最近更新時間排列</p>
        </div>

        <div className="hidden grid-cols-[minmax(260px,1.8fr)_110px_120px_minmax(150px,1fr)_120px_150px] gap-4 border-b border-[#ebeff5] px-6 py-3 text-xs font-medium text-gray-400 lg:grid">
          <span>企劃名稱與目標</span><span>狀態</span><span>規劃規模</span><span>規劃進度</span><span>最後更新</span><span className="text-right">操作</span>
        </div>

        <div className="divide-y divide-[#ebeff5]">
          {plans.map((plan) => {
            const meta = statusMeta[plan.status] ?? { label: plan.status, tone: "bg-gray-100 text-gray-600" };
            const progress = getPlanProgress(plan.status);
            const href = `/clients/${clientId}/marketing-plans/${plan.id}`;
            return (
              <article key={plan.id} className="relative grid gap-4 px-5 py-5 transition-colors hover:bg-[#fcfbff] sm:px-6 lg:grid-cols-[minmax(260px,1.8fr)_110px_120px_minmax(150px,1fr)_120px_150px] lg:items-center">
                <div className="min-w-0">
                  <Link href={href} className="font-bold text-gray-900 outline-none transition-colors hover:text-violet-600 focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring">{planTitle(plan)}</Link>
                  <p className="mt-1 line-clamp-1 text-sm text-gray-500">{plan.goals.join("、") || "尚未設定行銷目標"}</p>
                  <p className="mt-2 text-xs text-gray-400 lg:hidden">{plan._count.campaigns} Campaign · {plan.totalPostCount} 篇內容 · 更新於 {formatUpdatedAt(plan.updatedAt)}</p>
                </div>
                <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${meta.tone}`}>{meta.label}</span></div>
                <div className="hidden text-sm text-gray-700 lg:block"><p>{plan.totalPostCount} 篇內容</p><p className="mt-0.5 text-xs text-gray-400">{plan._count.campaigns} Campaign</p></div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-gray-400">規劃進度</span><span className="font-semibold text-violet-600">{progress}%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-violet-600" style={{ width: `${progress}%` }} /></div>
                </div>
                <time className="hidden text-sm text-gray-500 lg:block" dateTime={plan.updatedAt}>{formatUpdatedAt(plan.updatedAt)}</time>
                <div className="flex items-center justify-end gap-2">
                  <Link href={href} className="inline-flex h-9 items-center rounded-lg border border-violet-300 px-3 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">進入企劃</Link>
                  <div className="relative">
                    <button type="button" aria-label={`開啟 ${planTitle(plan)} 操作選單`} aria-expanded={openMenuId === plan.id} onClick={() => setOpenMenuId((current) => current === plan.id ? null : plan.id)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#ebeff5] text-gray-500 transition-colors hover:border-violet-300 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MoreHorizontal className="h-4 w-4" /></button>
                    {openMenuId === plan.id && (
                      <div className="absolute right-0 top-11 z-20 w-36 rounded-xl border border-[#ebeff5] bg-white p-1.5 shadow-lg">
                        <button type="button" onClick={() => requestDelete(plan)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />刪除企劃</button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {deleteTarget && (
        <div role="presentation" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteTarget(null); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-plan-title" aria-describedby="delete-plan-description" className="w-full max-w-md rounded-2xl border border-[#ebeff5] bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><AlertTriangle className="h-5 w-5" /></div>
            <h2 id="delete-plan-title" className="mt-4 text-lg font-bold text-gray-900">刪除「{planTitle(deleteTarget)}」？</h2>
            <p id="delete-plan-description" className="mt-2 text-sm leading-6 text-gray-500">Brief、Campaign、Topics 與日曆排程都會永久刪除。已建立的圖文活動會保留，但會解除與這份企劃的關聯。</p>
            {deleteError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="h-10 rounded-lg border border-[#ebeff5] px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50">取消</button>
              <button type="button" onClick={deletePlan} disabled={deleting} className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50">{deleting ? <><Loader2 className="h-4 w-4 animate-spin" />刪除中…</> : <><Trash2 className="h-4 w-4" />確認刪除</>}</button>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}
