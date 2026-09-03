"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, CheckSquare, ChevronLeft, GripVertical, Loader2, Sparkles, Square, X } from "lucide-react";
import { CONTENT_TYPE_META, type ContentType } from "@/lib/marketing-planner";
import { assignInitialSchedule, calendarDays, dateKey } from "@/lib/planner/calendar";
import { ContentBriefDrawer } from "@/components/marketing-planner/ContentBriefDrawer";
import type { BriefCampaign, BriefSignal } from "@/lib/planner/content-brief";

type Topic = {
  id: string;
  topic: string;
  contentType: string;
  format: string;
  status: string;
  scheduledDate: string | null;
  campaignId: string | null;
  contentDirection: string;
  platforms: string[];
  recommendationReason: string;
  sourceSignals: BriefSignal[];
  generatedActivityId: string | null;
  previewImageUrl?: string | null;   // 核准選定的成品圖縮圖（已製作／已完成才有）
  campaign?: { name: string } | null;
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const TYPE_STYLES: Record<ContentType, string> = {
  BRAND: "border-l-rose-400",
  EDUCATION: "border-l-amber-400",
  PRODUCT: "border-l-blue-400",
  ENGAGEMENT: "border-l-violet-400",
  PROMOTION: "border-l-emerald-400",
};
const STATUS_STYLES: Record<string, { label: string; dot: string }> = {
  PLANNING: { label: "尚未製作", dot: "bg-gray-300" },
  DRAFT: { label: "草稿", dot: "bg-amber-400" },
  GENERATING: { label: "製作中", dot: "bg-amber-400" },
  NEEDS_REVIEW: { label: "待審核", dot: "bg-orange-500" },
  APPROVED: { label: "已完成", dot: "bg-emerald-500" },
};

export function PlannerCalendarView({ planId, clientId, year, month, initialTopics, campaigns }: { planId: string; clientId: string; year: number; month: number; initialTopics: Topic[]; campaigns: BriefCampaign[] }) {
  const router = useRouter();
  const [topics, setTopics] = useState(initialTopics);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // ⑥ 批次製作：多選 → 走同一條 per-item 路徑（建 Activity → /api/generate），非獨立批次器
  const [batchMode, setBatchMode] = useState(false);
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, failed: 0 });
  const initialized = useRef(false);
  const days = useMemo(() => calendarDays(year, month), [year, month]);
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  const persistDate = async (id: string, scheduledDate: string | null) => {
    const response = await fetch(`/api/content-plan-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledDate }),
    });
    if (!response.ok) throw new Error("schedule update failed");
  };

  useEffect(() => {
    if (initialized.current || !topics.some((item) => !item.scheduledDate)) return;
    initialized.current = true;
    const arranged = assignInitialSchedule(topics, year, month);
    const changes = arranged.filter((item, index) => item.scheduledDate !== topics[index]?.scheduledDate);
    setTopics(arranged);
    setSaving(true);
    Promise.all(changes.map((item) => persistDate(item.id, item.scheduledDate)))
      .catch(() => { setTopics(topics); setError("自動排期未能儲存，請重新整理後再試。"); })
      .finally(() => setSaving(false));
  }, [month, topics, year]);

  const moveTopic = async (id: string, scheduledDate: string | null) => {
    const previous = topics;
    setError("");
    setTopics((items) => items.map((item) => item.id === id ? { ...item, scheduledDate } : item));
    setSaving(true);
    try { await persistDate(id, scheduledDate); }
    catch { setTopics(previous); setError("日期未能儲存，已還原原本排期。"); }
    finally { setSaving(false); }
  };

  const topicsForDay = (day: number) => {
    const key = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    return topics.filter((item) => dateKey(item.scheduledDate) === key);
  };
  const unscheduled = topics.filter((item) => {
    const key = dateKey(item.scheduledDate);
    return !key || !key.startsWith(monthPrefix);
  });

  // 可批次的狀態：尚未製作 / 草稿（含生成失敗回退的 DRAFT）；生成中/待審核/已完成不重複批次
  const isBatchable = (item: Topic) => item.status === "PLANNING" || item.status === "DRAFT";
  const toggleBatch = (id: string) => setBatchIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const batchList = topics.filter((item) => batchIds.has(item.id) && isBatchable(item));
  const batchCarousel = batchList.filter((item) => item.format === "CAROUSEL").length;
  const batchSingle = batchList.length - batchCarousel;
  const exitBatch = () => { setBatchMode(false); setBatchIds(new Set()); };

  const runBatch = async () => {
    const ids = batchList.map((item) => item.id);
    if (!ids.length) return;
    setConfirmBatch(false); setError(""); setBatchRunning(true);
    setBatchProgress({ done: 0, total: ids.length, failed: 0 });
    for (const id of ids) {
      setTopics((items) => items.map((item) => item.id === id ? { ...item, status: "GENERATING" } : item));
      try {
        const created = await fetch(`/api/content-plan-items/${id}/activity`, { method: "POST" });
        if (!created.ok) throw new Error("activity");
        const { activityId } = await created.json() as { activityId: string };
        const generated = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId }) });
        if (!generated.ok) throw new Error("generate");
        setTopics((items) => items.map((item) => item.id === id ? { ...item, status: "NEEDS_REVIEW", generatedActivityId: activityId } : item));
        setBatchProgress((progress) => ({ ...progress, done: progress.done + 1 }));
      } catch {
        setTopics((items) => items.map((item) => item.id === id ? { ...item, status: "DRAFT" } : item));
        setBatchProgress((progress) => ({ ...progress, done: progress.done + 1, failed: progress.failed + 1 }));
      }
    }
    setBatchRunning(false); setBatchMode(false); setBatchIds(new Set());
  };

  const card = (item: Topic) => {
    const type = (item.contentType in CONTENT_TYPE_META ? item.contentType : "BRAND") as ContentType;
    const status = STATUS_STYLES[item.status] ?? STATUS_STYLES.PLANNING;
    if (batchMode) {
      const selectable = isBatchable(item);
      const selected = batchIds.has(item.id);
      return (
        <article key={item.id} role="button" tabIndex={0} aria-pressed={selected}
          onClick={() => selectable && toggleBatch(item.id)}
          onKeyDown={(event) => { if (selectable && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); toggleBatch(item.id); } }}
          className={`rounded-lg border-l-[3px] px-2.5 py-2 shadow-sm transition ${TYPE_STYLES[type]} ${selectable ? "cursor-pointer bg-white hover:-translate-y-0.5 hover:shadow-md" : "cursor-not-allowed bg-gray-50 opacity-50"} ${selected ? "border border-violet-400 ring-2 ring-violet-300" : "border border-gray-200"}`}>
          <div className="flex items-start gap-1.5">
            {selectable ? (selected ? <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" /> : <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300" />) : <span className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs font-semibold leading-4 text-gray-800">{item.topic}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} title={status.label} />
                <span>{CONTENT_TYPE_META[type].label}</span><span>·</span><span>{item.format === "CAROUSEL" ? "多圖" : "單圖"}</span>
              </div>
            </div>
          </div>
        </article>
      );
    }
    return (
      <article key={item.id} role="button" tabIndex={0} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)} onClick={() => setSelectedId(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(item.id); }}
        className={`group cursor-grab rounded-lg border border-gray-200 border-l-[3px] bg-white px-2.5 py-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-300 active:cursor-grabbing ${TYPE_STYLES[type]}`}>
        {item.previewImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewImageUrl} alt="" className="mb-1.5 h-16 w-full rounded-md object-cover" />
        )}
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-xs font-semibold leading-4 text-gray-800">{item.topic}</p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-400">
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} title={status.label} />
              <span>{CONTENT_TYPE_META[type].label}</span><span>·</span><span>{item.format === "CAROUSEL" ? "多圖" : "單圖"}</span>
            </div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <button onClick={() => router.push(`/clients/${clientId}/marketing-plans/${planId}/plan`)} className="mb-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
            <ChevronLeft className="h-3.5 w-3.5" />返回內容企劃
          </button>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><CalendarRange className="h-5 w-5" /></span>
            <div><h1 className="text-2xl font-bold text-gray-900">{year} 年 {month} 月內容日曆</h1><p className="mt-1 text-sm text-gray-400">拖曳內容卡片即可調整發文日期。</p></div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {Object.entries(STATUS_STYLES).filter(([key]) => ["PLANNING", "GENERATING", "NEEDS_REVIEW", "APPROVED"].includes(key)).map(([key, value]) => <span key={key} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${value.dot}`} />{value.label}</span>)}
          {saving && <span className="flex items-center gap-1 text-violet-600"><Loader2 className="h-3.5 w-3.5 animate-spin" />儲存中</span>}
          {!batchMode && topics.length > 0 && <button onClick={() => setBatchMode(true)} className="flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"><Sparkles className="h-3.5 w-3.5" />批次製作</button>}
        </div>
      </header>

      {batchMode && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
          <p className="text-sm text-violet-900">
            {batchRunning
              ? <>正在依企劃自動生成內容…完成 <span className="font-semibold">{batchProgress.done}/{batchProgress.total}</span>{batchProgress.failed > 0 && <span className="text-red-600">（{batchProgress.failed} 篇失敗）</span>}</>
              : <>勾選要製作的內容（尚未製作／草稿），一次交給 AI 生成。已選 <span className="font-semibold">{batchList.length}</span> 篇</>}
          </p>
          <div className="flex items-center gap-2">
            {!batchRunning && <button onClick={exitBatch} className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-white/70">取消</button>}
            <button onClick={() => setConfirmBatch(true)} disabled={batchRunning || !batchList.length} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              {batchRunning ? <><Loader2 className="h-4 w-4 animate-spin" />生成中 {batchProgress.done}/{batchProgress.total}</> : <><Sparkles className="h-4 w-4" />產生已選 {batchList.length} 篇</>}
            </button>
          </div>
        </div>
      )}

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_240px]">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="hidden grid-cols-7 border-b bg-gray-50/70 sm:grid">{WEEKDAYS.map((day) => <div key={day} className="px-3 py-2 text-center text-[11px] font-medium text-gray-400">週{day}</div>)}</div>
          <div className="grid sm:grid-cols-7">
            {days.map((day, index) => day === null ? <div key={`blank-${index}`} className="hidden min-h-32 border-b border-r bg-gray-50/40 sm:block" /> : (
              <div key={day} onDragOver={(event) => event.preventDefault()} onDrop={(event) => moveTopic(event.dataTransfer.getData("text/plain"), `${monthPrefix}-${String(day).padStart(2, "0")}`)}
                className="min-h-32 border-b border-r border-gray-100 p-2.5 transition-colors hover:bg-violet-50/30">
                <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-gray-500">{day}</span><span className="text-[10px] text-gray-300">{topicsForDay(day).length || ""}</span></div>
                <div className="space-y-2">{topicsForDay(day).map(card)}</div>
              </div>
            ))}
          </div>
        </section>

        <aside onDragOver={(event) => event.preventDefault()} onDrop={(event) => moveTopic(event.dataTransfer.getData("text/plain"), null)} className="h-fit rounded-2xl border border-gray-200 bg-white p-4 2xl:sticky 2xl:top-4">
          <div className="mb-3"><h2 className="text-sm font-semibold text-gray-900">未排期內容</h2><p className="mt-1 text-[11px] text-gray-400">拖到日期安排，或拖回這裡取消排期。</p></div>
          <div className="space-y-2">{unscheduled.map(card)}</div>
          {!unscheduled.length && <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-3 py-6 text-center text-xs text-emerald-700">本月 {topics.length} 篇內容皆已排期</div>}
        </aside>
      </div>
      {selectedId && topics.find((item) => item.id === selectedId) && <ContentBriefDrawer
        item={topics.find((item) => item.id === selectedId)!}
        campaigns={campaigns}
        clientId={clientId}
        onClose={() => setSelectedId(null)}
        onSaved={(saved) => setTopics((items) => items.map((item) => item.id === saved.id ? { ...item, ...saved } : item))}
      />}

      {confirmBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="取消" onClick={() => setConfirmBatch(false)} className="absolute inset-0 cursor-default bg-gray-950/25 backdrop-blur-[1px]" />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <h2 className="text-lg font-bold text-gray-900">產生已選 {batchList.length} 篇內容</h2>
              <button aria-label="關閉" onClick={() => setConfirmBatch(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm leading-6 text-gray-500">
              AI 將根據企劃資料自動產生內容
              {(batchCarousel > 0 || batchSingle > 0) && <>：{batchCarousel > 0 && `${batchCarousel} 篇多圖`}{batchCarousel > 0 && batchSingle > 0 && "、"}{batchSingle > 0 && `${batchSingle} 篇單圖`}</>}
              。走現有單圖／多圖生成流程，完成後回到日曆等待審核。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmBatch(false)} className="rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100">取消</button>
              <button onClick={runBatch} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700"><Sparkles className="h-4 w-4" />開始生成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
