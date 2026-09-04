"use client";

import { useState } from "react";
import { Calendar, Check, CheckSquare, ImageOff, Loader2, MoreHorizontal, Send, Sparkles, Square } from "lucide-react";
import { CONTENT_TYPE_META, type ContentType } from "@/lib/marketing-planner";
import { STATUS_BUCKETS, statusMeta } from "@/lib/planner/status";

export type ListItem = {
  id: string;
  topic: string;
  contentType: string;
  format: string;
  status: string;
  scheduledDate: string | null;
  campaign?: { name: string } | null;
  generatedActivityId: string | null;
  previewImageUrl?: string | null;
};

const isBatchable = (s: string) => s === "PLANNING" || s === "DRAFT";
function mmdd(v: string | null) { if (!v) return "未排期"; const d = new Date(v); return `${d.getMonth() + 1}/${d.getDate()}`; }

export function ProductionListView({ items, batchIds, onToggleBatch, onStartBatch, onStartMaking, onView, onApprove, onSchedulePublish, startingId }: {
  items: ListItem[];
  batchIds: Set<string>;
  onToggleBatch: (id: string) => void;
  onStartBatch: () => void;
  onStartMaking: (id: string) => void;
  onView: (id: string) => void;
  onApprove: (id: string) => void;
  onSchedulePublish: (id: string) => void;
  startingId: string | null;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [menuId, setMenuId] = useState("");

  const shown = filter ? items.filter((it) => STATUS_BUCKETS.find((b) => b.key === filter)?.match(it.status)) : items;
  const selectedCount = items.filter((it) => batchIds.has(it.id) && isBatchable(it.status)).length;

  return (
    <div className="rounded-2xl border border-[#ebeff5] bg-white">
      {/* Header + 狀態摘要 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ebeff5] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">製作清單</h2>
          <p className="mt-0.5 text-xs text-gray-400">本月共 {items.length} 篇內容</p>
        </div>
        {selectedCount > 0 && (
          <button onClick={onStartBatch} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
            <Sparkles className="h-4 w-4" />批次製作 {selectedCount} 篇
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#ebeff5] px-5 py-3">
        <button onClick={() => setFilter(null)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === null ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>全部 {items.length}</button>
        {STATUS_BUCKETS.map((b) => {
          const n = items.filter((it) => b.match(it.status)).length;
          return (
            <button key={b.key} onClick={() => setFilter(filter === b.key ? null : b.key)} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${filter === b.key ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${b.dot}`} />{b.label} {n}
            </button>
          );
        })}
      </div>

      {/* 列表 */}
      {shown.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-gray-400">這個篩選沒有內容。</div>
      ) : (
        <ul className="divide-y divide-[#ebeff5]">
          {shown.map((it) => {
            const type = (it.contentType in CONTENT_TYPE_META ? it.contentType : "BRAND") as ContentType;
            const meta = statusMeta(it.status);
            const batchable = isBatchable(it.status);
            const selected = batchIds.has(it.id);
            return (
              <li key={it.id} className="flex items-center gap-3 px-5 py-3 hover:bg-violet-50/40">
                <button aria-label="選取" onClick={() => batchable && onToggleBatch(it.id)} disabled={!batchable} className={batchable ? "text-violet-600" : "cursor-default text-gray-200"}>
                  {batchable && selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>

                {it.previewImageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={it.previewImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-50 text-gray-300"><ImageOff className="h-4 w-4" /></span>}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{it.topic}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{mmdd(it.scheduledDate)}</span>
                    <span>·</span><span>{CONTENT_TYPE_META[type].label}</span>
                    {it.campaign?.name && <><span>·</span><span className="truncate">{it.campaign.name}</span></>}
                    <span>·</span><span>{it.format === "CAROUSEL" ? "多圖" : "單圖"}</span>
                  </div>
                </div>

                <span className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500">
                  {it.status === "GENERATING" ? <Loader2 className="h-3 w-3 animate-spin text-amber-500" /> : <span className={`h-2 w-2 rounded-full ${meta.dot}`} />}
                  {meta.label}
                </span>

                {/* 依狀態的單一 primary action + ⋯ */}
                <div className="relative flex shrink-0 items-center gap-1">
                  {rowAction(it, { onStartMaking, onView, startingId })}
                  {(it.status === "NEEDS_REVIEW" || it.status === "APPROVED") && (
                    <>
                      <button aria-label="更多" onClick={() => setMenuId(menuId === it.id ? "" : it.id)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><MoreHorizontal className="h-4 w-4" /></button>
                      {menuId === it.id && (
                        <>
                          <button aria-label="關閉" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuId("")} />
                          <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-lg border border-[#ebeff5] bg-white py-1 shadow-lg">
                            {it.status === "NEEDS_REVIEW" && <button onClick={() => { setMenuId(""); onApprove(it.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"><Check className="h-3.5 w-3.5 text-emerald-600" />核准完成</button>}
                            {it.status === "APPROVED" && <button onClick={() => { setMenuId(""); onSchedulePublish(it.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"><Send className="h-3.5 w-3.5 text-violet-600" />排程發布</button>}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function rowAction(it: ListItem, h: { onStartMaking: (id: string) => void; onView: (id: string) => void; startingId: string | null }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-medium";
  if (it.status === "PLANNING" || it.status === "DRAFT")
    return <button onClick={() => h.onStartMaking(it.id)} disabled={h.startingId === it.id} className={`${base} bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50`}>{h.startingId === it.id ? "製作中…" : "開始製作"}</button>;
  if (it.status === "GENERATING")
    return <button onClick={() => it.generatedActivityId && h.onView(it.id)} disabled={!it.generatedActivityId} className={`${base} border border-[#ebeff5] text-gray-600 hover:bg-gray-50 disabled:opacity-50`}>查看進度</button>;
  if (it.status === "NEEDS_REVIEW")
    return <button onClick={() => h.onView(it.id)} className={`${base} bg-violet-600 text-white hover:bg-violet-700`}>查看結果</button>;
  return <button onClick={() => h.onView(it.id)} className={`${base} border border-[#ebeff5] text-gray-600 hover:bg-gray-50`}>查看</button>;
}
