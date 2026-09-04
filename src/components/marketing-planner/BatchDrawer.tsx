"use client";

import { Loader2, Sparkles, X } from "lucide-react";
import { statusMeta } from "@/lib/planner/status";

type BatchItem = { id: string; topic: string; format: string; status: string; campaign?: { name: string } | null };

const AUTOFILL = ["品牌 Brand", "品牌語氣 Voice", "Campaign", "產品 Product", "主題 Topic", "內容類型", "內容目標", "發布平台", "發布日期", "溝通點 Copy", "視覺方向 Visual"];

// 批次製作 Drawer：一次送出多篇，每篇仍走既有單圖/多圖生成流程（不新建 batch generator）。
export function BatchDrawer({ items, running, progress, onRun, onClose }: {
  items: BatchItem[];
  running: boolean;
  progress: { done: number; total: number; failed: number };
  onRun: () => void;
  onClose: () => void;
}) {
  const carousel = items.filter((i) => i.format === "CAROUSEL").length;
  const single = items.length - carousel;
  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="關閉" onClick={onClose} className="absolute inset-0 cursor-default bg-gray-950/25 backdrop-blur-[1px]" />
      <aside role="dialog" aria-modal="true" className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900">批次製作</h2>
            <p className="mt-1 text-xs text-gray-400">已選擇 {items.length} 篇內容{(single > 0 || carousel > 0) && `（${single > 0 ? `${single} 單圖` : ""}${single > 0 && carousel > 0 ? "、" : ""}${carousel > 0 ? `${carousel} 多圖` : ""}）`}</p>
          </div>
          <button aria-label="關閉" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <ul className="space-y-2">
            {items.map((it) => {
              const meta = statusMeta(it.status);
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{it.topic}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{it.campaign?.name ?? "未指定 Campaign"} · {it.format === "CAROUSEL" ? "多圖" : "單圖"}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-gray-500">
                    {it.status === "GENERATING" ? <Loader2 className="h-3 w-3 animate-spin text-amber-500" /> : <span className={`h-2 w-2 rounded-full ${meta.dot}`} />}
                    {meta.label}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/70 p-4">
            <p className="text-xs font-semibold text-gray-700">AI 將自動帶入</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {AUTOFILL.map((f) => <span key={f} className="rounded-md bg-white px-2 py-1 text-[11px] text-gray-500 shadow-sm">{f}</span>)}
            </div>
            <p className="mt-3 text-[11px] leading-5 text-gray-400">每篇獨立走既有單圖／多圖生成流程，完成一篇即更新狀態為「待審核」，不需等全部完成。</p>
          </div>
        </div>

        <footer className="border-t border-gray-100 px-6 py-4">
          <button onClick={onRun} disabled={running || items.length === 0} className="flex w-full items-center justify-center gap-1.5 rounded-full bg-violet-600 py-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
            {running ? <><Loader2 className="h-4 w-4 animate-spin" />生成中 {progress.done}/{progress.total}{progress.failed > 0 && <span className="text-red-200">（{progress.failed} 失敗）</span>}</> : <><Sparkles className="h-4 w-4" />開始製作 {items.length} 篇</>}
          </button>
        </footer>
      </aside>
    </div>
  );
}
