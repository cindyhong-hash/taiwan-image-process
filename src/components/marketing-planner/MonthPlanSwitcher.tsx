"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";

type PlanRow = { id: string; year: number; month: number; status: string };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿", STRATEGY_READY: "策略完成", TOPICS_READY: "已規劃",
  CALENDAR_READY: "已排程", GENERATION_READY: "製作中", REVIEW: "審核中", COMPLETED: "已完成",
};
// 已規劃(有主題/排程)→ 日曆;否則(還在規劃)→ Brief。與月度企劃落地邏輯一致。
const PLANNED = new Set(["TOPICS_READY", "CALENDAR_READY", "GENERATION_READY", "REVIEW", "COMPLETED"]);
const destOf = (status: string) => (PLANNED.has(status) ? "/calendar" : "");

/**
 * 月份切換 + 「其他月份」下拉(取代原本的企劃列表)。
 * ‹ › 切相鄰月;點年月開下拉列出所有月份可跳、可刪。target 決定跳去 Brief 或日曆。
 * beforeNavigate: Brief 傳入 saveBrief，切換前先存檔。
 */
export function MonthPlanSwitcher({ clientId, planId, year, month, beforeNavigate }: {
  clientId: string; planId: string; year: number; month: number;
  beforeNavigate?: () => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [plans, setPlans] = useState<PlanRow[] | null>(null);

  const go = async (y: number, m: number) => {
    if (switching) return;
    setSwitching(true); setOpen(false);
    try {
      if (beforeNavigate) await beforeNavigate();
      const res = await fetch(`/api/marketing-plans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, year: y, month: m }) });
      const p = await res.json();
      if (p?.id) router.push(`/clients/${clientId}/marketing-plans/${p.id}${destOf(p.status)}`);
      else setSwitching(false);
    } catch { setSwitching(false); }
  };
  const shift = (d: number) => { let y = year, m = month + d; if (m < 1) { m = 12; y -= 1; } if (m > 12) { m = 1; y += 1; } go(y, m); };
  const goToPlan = (p: PlanRow) => { setOpen(false); router.push(`/clients/${clientId}/marketing-plans/${p.id}${destOf(p.status)}`); };

  const toggleList = () => {
    setOpen((o) => !o);
    if (plans === null) fetch(`/api/marketing-plans?clientId=${clientId}`).then((r) => r.json()).then(setPlans).catch(() => setPlans([]));
  };
  const remove = async (id: string) => {
    if (!confirm("確定刪除這個月的企劃?此動作無法復原。")) return;
    await fetch(`/api/marketing-plans/${id}`, { method: "DELETE" }).catch(() => {});
    setPlans((cur) => cur?.filter((p) => p.id !== id) ?? null);
    if (id === planId) router.push(`/clients/${clientId}/marketing-plans`);   // 刪掉當前 → 回入口(落到當月)
  };

  return (
    <div className="relative ml-1 flex items-center rounded-lg border border-[#ebeff5] bg-white px-1 py-0.5">
      <button aria-label="上個月" onClick={() => shift(-1)} disabled={switching} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
      <button onClick={toggleList} className="flex min-w-[116px] items-center justify-center gap-1.5 px-1 text-sm font-medium text-gray-900 hover:text-violet-700">
        {switching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : <CalendarRange className="h-3.5 w-3.5 text-gray-400" />}
        {year} 年 {month} 月<ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <button aria-label="下個月" onClick={() => shift(1)} disabled={switching} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>

      {open && (
        <>
          <button aria-label="關閉" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-10 z-20 w-64 -translate-x-1/2 overflow-hidden rounded-xl border border-[#ebeff5] bg-white py-1 shadow-lg">
            <p className="px-3 py-1.5 text-[11px] font-medium text-gray-400">其他月份</p>
            <div className="max-h-72 overflow-y-auto">
              {plans === null ? (
                <div className="flex justify-center py-4 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /></div>
              ) : plans.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400">還沒有其他月份的企劃。</p>
              ) : plans.map((p) => (
                <div key={p.id} className={`group flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${p.id === planId ? "bg-violet-50/60" : ""}`}>
                  <button onClick={() => goToPlan(p)} className="flex flex-1 items-center gap-2 text-left">
                    <span className={`font-medium ${p.id === planId ? "text-violet-700" : "text-gray-800"}`}>{p.year} 年 {p.month} 月</span>
                    <span className="text-[10px] text-gray-400">{STATUS_LABEL[p.status] ?? p.status}</span>
                  </button>
                  <button aria-label="刪除" onClick={() => remove(p.id)} className="rounded p-1 text-gray-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <button onClick={() => { const now = new Date(); go(now.getFullYear(), now.getMonth() + 1); }} className="mt-1 flex w-full items-center gap-2 border-t border-[#ebeff5] px-3 py-2.5 text-xs font-medium text-violet-700 hover:bg-violet-50"><Plus className="h-3.5 w-3.5" />回到當月企劃</button>
          </div>
        </>
      )}
    </div>
  );
}
