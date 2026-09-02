"use client";
/**
 * ② AI 內容企劃（Flow A）— 單頁分段：策略摘要 + Content Mix + Topics（含推薦理由/來源訊號）。
 * 底部 CTA「確認企劃 → 安排到內容日曆」進入③內容日曆。
 * 生成邏輯沿用 pack StrategyAndTopics；改為 redesign 白卡樣式，移除日曆與批次器。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronLeft, Loader2, Minus, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { CONTENT_TYPE_META, CONTENT_TYPES, type ContentType, type PlannerStrategy } from "@/lib/marketing-planner";

type Signal = { id: string; source: string; label: string; score?: number };
type Topic = { id: string; campaignId?: string | null; contentType: string; topic: string; contentDirection: string; format: string; platforms: string[]; recommendationReason?: string; sourceSignals?: Signal[]; status?: string };
type Campaign = { id: string; name: string };

const MISSING_PRODUCT_WARNING = "目前 Campaign 沒有關聯產品，AI 將只使用品牌資料，產品型主題可能較不精準。仍要繼續生成嗎？";

function moveOne<T extends { count: number }>(items: T[], index: number, delta: number) {
  const next = items.map((x) => ({ ...x }));
  if (delta > 0) { const donor = next.map((x, i) => ({ i, count: i === index ? -1 : x.count })).sort((a, b) => b.count - a.count)[0]; if (!donor || donor.count <= 0) return items; next[index].count++; next[donor.i].count--; }
  else { if (next[index].count <= 0) return items; const receiver = next.map((x, i) => ({ i, count: i === index ? -1 : x.count })).sort((a, b) => b.count - a.count)[0]; if (!receiver) return items; next[index].count--; next[receiver.i].count++; }
  return next;
}

export function PlannerStrategyView({ planId, clientId, total, campaigns, hasProducts, initialStrategy, initialTopics }: { planId: string; clientId: string; total: number; campaigns: Campaign[]; hasProducts: boolean; initialStrategy?: PlannerStrategy; initialTopics: Topic[] }) {
  const router = useRouter();
  const [strategy, setStrategy] = useState<PlannerStrategy | undefined>(initialStrategy?.contentMix?.length ? initialStrategy : undefined);
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmReplan, setConfirmReplan] = useState(false);
  const producedCount = topics.filter((t) => t.status && t.status !== "PLANNING").length; // 已製作/編輯過(非 PLANNING)

  const confirmProductContext = () => hasProducts || window.confirm(MISSING_PRODUCT_WARNING);
  const generateStrategy = async (current?: PlannerStrategy, productWarningConfirmed = false) => {
    if (!productWarningConfirmed && !confirmProductContext()) return;
    setBusy("strategy"); setError("");
    try { const r = await fetch(`/api/marketing-plans/${planId}/strategy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current ? { strategy: current } : {}) }); if (!r.ok) throw new Error(); setStrategy((await r.json()).strategy); }
    catch { setError("策略暫時無法產生，請稍後再試。"); } finally { setBusy(null); }
  };
  const generateTopics = async (mode?: "all") => {
    if (!strategy || !confirmProductContext()) return; setConfirmReplan(false); setBusy("topics"); setError("");
    try { await generateStrategy(strategy, true); const r = await fetch(`/api/marketing-plans/${planId}/topics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode ? { mode } : {}) }); if (!r.ok) throw new Error(); setTopics((await r.json()).items); }
    catch { setError("Topics 暫時無法產生，請稍後再試。"); } finally { setBusy(null); }
  };
  const updateTopic = (id: string, patch: Partial<Topic>, save = false) => { setTopics((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x))); if (save) fetch(`/api/content-plan-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); };
  const saveText = (item: Topic) => fetch(`/api/content-plan-items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: item.topic, contentDirection: item.contentDirection }) });
  const regenerate = async (id: string) => { setBusy(id); const r = await fetch(`/api/content-plan-items/${id}/regenerate`, { method: "POST" }); if (r.ok) updateTopic(id, await r.json()); setBusy(null); };
  const remove = async (id: string) => { await fetch(`/api/content-plan-items/${id}`, { method: "DELETE" }); setTopics((all) => all.filter((x) => x.id !== id)); };
  const add = async () => { const r = await fetch(`/api/marketing-plans/${planId}/topics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add" }) }); if (r.ok) { const item = await r.json(); setTopics((all) => [...all, item]); } };

  const mixTotal = strategy?.contentMix.reduce((n, x) => n + x.count, 0) ?? 0;

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => router.push(`/clients/${clientId}/marketing-plans/${planId}`)} className="mb-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
          <ChevronLeft className="h-3.5 w-3.5" />返回 Brief
        </button>
        <h1 className="text-2xl font-bold text-gray-900">AI 為你規劃了本月內容 ✨</h1>
        <p className="mt-1 text-sm text-gray-400">AI 依目標與 Campaign 分配 {total} 篇內容；策略、篇數與每則主題都能再調整。</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      {!hasProducts && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">目前 Campaign 尚未關聯產品。AI 不會從品牌名稱猜測產品；若要產生精準的產品主題，請先回 Brief 加入產品。</div>}

      {/* 策略 + Content Mix */}
      <section className="mb-4 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">本月內容策略</h2>
          <button onClick={() => generateStrategy()} disabled={!!busy} className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50">
            {busy === "strategy" ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 inline h-4 w-4" />}{strategy ? "重新建議" : "產生內容策略"}
          </button>
        </div>

        {!strategy ? (
          <div className="mt-5 rounded-xl border border-dashed py-10 text-center text-sm text-gray-400">按「產生內容策略」，AI 會依 Brief 規劃本月內容組合。</div>
        ) : (
          <>
            <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50/60 p-4 text-sm text-violet-900">{strategy.summary}</div>
            <h3 className="mb-3 mt-6 text-sm font-semibold text-gray-700">Content Mix <span className="font-normal text-gray-400">合計 {mixTotal} 篇</span></h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {strategy.contentMix.map((item, i) => (
                <div key={item.type} className="rounded-xl border border-gray-200 p-3 text-center">
                  <div className="text-xs font-medium text-gray-700">{CONTENT_TYPE_META[item.type].label}</div>
                  <div className="my-3 flex items-center justify-center gap-3">
                    <button onClick={() => setStrategy({ ...strategy, contentMix: moveOne(strategy.contentMix, i, -1) })} className="flex h-7 w-7 items-center justify-center rounded-full border hover:bg-gray-50"><Minus className="h-3 w-3" /></button>
                    <strong className="text-xl text-gray-900">{item.count}</strong>
                    <button onClick={() => setStrategy({ ...strategy, contentMix: moveOne(strategy.contentMix, i, 1) })} className="flex h-7 w-7 items-center justify-center rounded-full border hover:bg-gray-50"><Plus className="h-3 w-3" /></button>
                  </div>
                  <div className="text-[11px] text-gray-400">{item.reason}</div>
                </div>
              ))}
            </div>
            <button onClick={() => generateTopics()} disabled={!!busy} className="mt-6 ml-auto block rounded-lg bg-violet-600 px-6 py-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              {busy === "topics" && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}確認策略，產生 {total} 個 Topics →
            </button>
          </>
        )}
      </section>

      {/* Topics */}
      {(topics.length > 0 || strategy) && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">內容主題 Topics</h2>
              <p className="mt-1 text-xs text-gray-400">點文字即可修改，離開欄位自動儲存。</p>
            </div>
            <div className="flex gap-2">
              <button onClick={add} className="rounded-lg border border-gray-200 px-3 py-2 text-xs hover:bg-gray-50"><Plus className="mr-1 inline h-3.5 w-3.5" />新增</button>
              <button onClick={() => generateTopics()} disabled={!!busy} title="保留已製作的主題，只重產尚未製作的" className="rounded-lg border border-gray-200 px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />重產未製作</button>
              <button onClick={() => setConfirmReplan(true)} disabled={!!busy} title="清空所有主題重新規劃" className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">全部重新規劃</button>
            </div>
          </div>

          {!topics.length ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-gray-400">確認上方策略後，AI 會在這裡產生完整 Topics。</div>
          ) : (
            <div className="space-y-3">
              {topics.map((item, i) => {
                const meta = CONTENT_TYPE_META[item.contentType as ContentType];
                return (
                  <div key={item.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-xs font-medium text-gray-300">{String(i + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <input value={item.topic} onChange={(e) => updateTopic(item.id, { topic: e.target.value })} onBlur={() => saveText(item)}
                          className="w-full border-0 p-0 text-sm font-semibold text-gray-900 focus:ring-0" />
                        <input value={item.contentDirection} onChange={(e) => updateTopic(item.id, { contentDirection: e.target.value })} onBlur={() => saveText(item)}
                          className="mt-1 w-full border-0 p-0 text-xs text-gray-400 focus:ring-0" placeholder="內容方向" />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select value={item.contentType} onChange={(e) => updateTopic(item.id, { contentType: e.target.value }, true)} className="rounded-md border border-gray-200 px-2 py-1 text-[11px]">
                            {CONTENT_TYPES.map((t) => <option key={t} value={t}>{CONTENT_TYPE_META[t].label}</option>)}
                          </select>
                          <select value={item.campaignId ?? ""} onChange={(e) => updateTopic(item.id, { campaignId: e.target.value }, true)} className="rounded-md border border-gray-200 px-2 py-1 text-[11px]">
                            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <select value={item.format} onChange={(e) => updateTopic(item.id, { format: e.target.value }, true)} className="rounded-md border border-gray-200 px-2 py-1 text-[11px]">
                            <option value="SINGLE">單圖</option><option value="CAROUSEL">Carousel</option>
                          </select>
                        </div>
                        {(item.recommendationReason || (item.sourceSignals && item.sourceSignals.length > 0)) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {item.recommendationReason && <span className="text-[11px] text-amber-700">🔥 {item.recommendationReason}</span>}
                            {item.sourceSignals?.map((s) => <span key={s.id} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">來源：{s.label}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button title="重新產生" onClick={() => regenerate(item.id)} className="p-1.5 text-gray-400 hover:text-violet-600">{busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>
                        <button title="刪除" onClick={() => remove(item.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {topics.length > 0 && (
            <div className="mt-6 flex items-center justify-between border-t pt-5">
              <p className="text-xs text-gray-400">確認後，AI 會把這些主題排進內容日曆。</p>
              <button onClick={() => router.push(`/clients/${clientId}/marketing-plans/${planId}/calendar`)}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700">
                <CalendarRange className="h-4 w-4" />確認企劃 → 安排到內容日曆
              </button>
            </div>
          )}
        </section>
      )}

      {confirmReplan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="取消" onClick={() => setConfirmReplan(false)} className="absolute inset-0 cursor-default bg-gray-950/25 backdrop-blur-[1px]" />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900">全部重新規劃？</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              這會清空目前 {topics.length} 篇主題並重新產生
              {producedCount > 0 && <>，其中 <span className="font-semibold text-red-600">{producedCount} 篇已製作／編輯</span> 的也會一併清除</>}
              。此動作無法復原。若只想補未製作的，請用「重產未製作」。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmReplan(false)} className="rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100">取消</button>
              <button onClick={() => generateTopics("all")} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">全部重新規劃</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
