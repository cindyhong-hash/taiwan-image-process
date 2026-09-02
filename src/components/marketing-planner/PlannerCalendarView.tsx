"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronLeft, GripVertical, Loader2 } from "lucide-react";
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

  const card = (item: Topic) => {
    const type = (item.contentType in CONTENT_TYPE_META ? item.contentType : "BRAND") as ContentType;
    const status = STATUS_STYLES[item.status] ?? STATUS_STYLES.PLANNING;
    return (
      <article key={item.id} role="button" tabIndex={0} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)} onClick={() => setSelectedId(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(item.id); }}
        className={`group cursor-grab rounded-lg border border-gray-200 border-l-[3px] bg-white px-2.5 py-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-300 active:cursor-grabbing ${TYPE_STYLES[type]}`}>
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
        </div>
      </header>

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
    </div>
  );
}
