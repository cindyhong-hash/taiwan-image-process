"use client";
/**
 * ① 月度 Brief（Flow A）— 單頁設定：目標 / 篇數 / 平台 + Campaign（展開設產品·說明·重要日期）。
 * 自動儲存。底部 CTA「AI 幫我規劃」是 P2→P3 的接點（② AI 內容企劃尚未建置）。
 * 由 pack PlannerEditor 精簡而來：移除 8 步進度條與內嵌 StrategyAndTopics。
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ImagePlus, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { LibraryImagePickerModal } from "@/components/activities/LibraryImagePickerModal";
import { MARKETING_GOALS, MARKETING_PLATFORMS } from "@/lib/marketing-planner";

type Product = { id?: string; label: string; imageUrl: string; sourceKind?: string; sourceId?: string | null };
type ImportantDate = { id?: string; date: string; label: string; note?: string };
type Campaign = { id: string; name: string; startDate: string; endDate: string; goals: string[]; description: string; sortOrder: number; products: Product[]; importantDates: ImportantDate[] };
type Plan = { id: string; clientId: string; year: number; month: number; goals: string[]; totalPostCount: number; platforms: string[]; status: string; client: { id: string; name: string }; campaigns: Campaign[] };

const COUNT_PRESETS = [8, 12, 16];
const dateValue = (value: string | Date) => new Date(value).toISOString().slice(0, 10);
const toggle = (items: string[], value: string) => (items.includes(value) ? items.filter((v) => v !== value) : [...items, value]);

export function PlannerBriefEditor({ initialPlan }: { initialPlan: Plan }) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [selectedId, setSelectedId] = useState(initialPlan.campaigns[0]?.id ?? "");
  const [showLibrary, setShowLibrary] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const skipFirst = useRef(true);
  const selected = plan.campaigns.find((c) => c.id === selectedId) ?? plan.campaigns[0];
  const monthInput = `${plan.year}-${String(plan.month).padStart(2, "0")}`;

  const updatePlan = (patch: Partial<Plan>) => { setPlan((p) => ({ ...p, ...patch })); setSaveState("dirty"); };
  const updateCampaign = (patch: Partial<Campaign>) => { if (!selected) return; setPlan((p) => ({ ...p, campaigns: p.campaigns.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)) })); setSaveState("dirty"); };

  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    if (saveState !== "dirty") return;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      await Promise.all([
        fetch(`/api/marketing-plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: plan.year, month: plan.month, goals: plan.goals, totalPostCount: plan.totalPostCount, platforms: plan.platforms }) }),
        ...plan.campaigns.map((c) => fetch(`/api/marketing-campaigns/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: c.name, startDate: c.startDate, endDate: c.endDate, goals: c.goals, description: c.description, sortOrder: c.sortOrder, products: c.products, importantDates: c.importantDates }) })),
      ]);
      setSaveState("saved");
    }, 700);
    return () => clearTimeout(timer);
  }, [plan, saveState]);

  const addCampaign = async () => {
    const res = await fetch(`/api/marketing-plans/${plan.id}/campaigns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Campaign ${plan.campaigns.length + 1}` }) });
    const campaign = await res.json();
    setPlan((p) => ({ ...p, campaigns: [...p.campaigns, campaign] }));
    setSelectedId(campaign.id);
  };
  const deleteCampaign = async (id: string) => {
    if (plan.campaigns.length <= 1 || !confirm("確定刪除這個 Campaign？")) return;
    await fetch(`/api/marketing-campaigns/${id}`, { method: "DELETE" });
    const campaigns = plan.campaigns.filter((c) => c.id !== id);
    setPlan((p) => ({ ...p, campaigns }));
    setSelectedId(campaigns[0]?.id ?? "");
  };
  const addImportantDate = () => updateCampaign({ importantDates: [...(selected?.importantDates ?? []), { date: dateValue(selected?.startDate ?? new Date()), label: "重要日期", note: "" }] });

  const goPlan = async () => {
    if (planning) return;
    setPlanning(true);
    // 先把 Brief 立即存檔（不等 debounce），再產生策略，然後進 ② AI 企劃頁
    try {
      await fetch(`/api/marketing-plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: plan.year, month: plan.month, goals: plan.goals, totalPostCount: plan.totalPostCount, platforms: plan.platforms }) });
      await Promise.all(plan.campaigns.map((c) => fetch(`/api/marketing-campaigns/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: c.name, startDate: c.startDate, endDate: c.endDate, goals: c.goals, description: c.description, sortOrder: c.sortOrder, products: c.products, importantDates: c.importantDates }) })));
      await fetch(`/api/marketing-plans/${plan.id}/strategy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    } catch { /* 策略失敗 ② 頁仍可手動重試 */ }
    router.push(`/clients/${plan.clientId}/marketing-plans/${plan.id}/plan`);
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{plan.year} 年 {plan.month} 月內容企劃</h1>
          <p className="mt-1 text-sm text-gray-400">設定本月目標與 Campaign，下一步交給 AI 規劃內容。</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-gray-400">
          <Save className="h-3.5 w-3.5" />{saveState === "saving" ? "儲存中…" : saveState === "dirty" ? "等待儲存" : "已自動儲存"}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* 左：月度資訊 */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">本月目標</h2>
          <p className="mb-4 text-xs text-gray-400">月度資訊只需設定一次</p>

          <label className="text-xs font-medium text-gray-600">月份</label>
          <input type="month" value={monthInput} onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); updatePlan({ year: y, month: m }); }}
            className="mb-4 mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />

          <label className="text-xs font-medium text-gray-600">這個月想達成什麼？（可多選）</label>
          <div className="mb-5 mt-2 flex flex-wrap gap-2">
            {MARKETING_GOALS.map((goal) => (
              <button key={goal} onClick={() => updatePlan({ goals: toggle(plan.goals, goal) })}
                className={`rounded-lg border px-3 py-2 text-xs transition-colors ${plan.goals.includes(goal) ? "border-violet-300 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                {plan.goals.includes(goal) && <Check className="mr-1 inline h-3 w-3" />}{goal}
              </button>
            ))}
          </div>

          <label className="text-xs font-medium text-gray-600">這個月預計發幾篇？</label>
          <div className="mb-5 mt-2 flex flex-wrap gap-2">
            {COUNT_PRESETS.map((n) => (
              <button key={n} onClick={() => updatePlan({ totalPostCount: n })}
                className={`rounded-lg border px-4 py-2 text-sm transition-colors ${plan.totalPostCount === n ? "border-violet-300 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>{n}</button>
            ))}
            <input type="number" min={1} max={60} value={plan.totalPostCount}
              onChange={(e) => updatePlan({ totalPostCount: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
              className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>

          <label className="text-xs font-medium text-gray-600">平台</label>
          <div className="mt-2 space-y-2">
            {MARKETING_PLATFORMS.map((platform) => (
              <button key={platform} onClick={() => updatePlan({ platforms: toggle(plan.platforms, platform) })}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${plan.platforms.includes(platform) ? "border-violet-300 bg-violet-50" : "border-gray-200 hover:border-gray-300"}`}>
                {plan.platforms.includes(platform) && <Check className="mr-1.5 inline h-3.5 w-3.5 text-violet-600" />}{platform}
              </button>
            ))}
          </div>
        </section>

        {/* 右：Campaign 清單 + 詳細 */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">這個月有哪些 Campaign？</h2>
                <p className="mt-1 text-xs text-gray-400">{plan.campaigns.length} 個 · 展開設定產品、說明與重要日期</p>
              </div>
              <button onClick={addCampaign} className="rounded-lg border border-violet-200 px-2.5 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50">
                <Plus className="mr-1 inline h-3.5 w-3.5" />新增 Campaign
              </button>
            </div>
            <div className="space-y-2">
              {plan.campaigns.map((campaign) => (
                <button key={campaign.id} onClick={() => setSelectedId(campaign.id)}
                  className={`group flex w-full gap-2 rounded-xl border p-3 text-left transition-colors ${selected?.id === campaign.id ? "border-violet-300 bg-violet-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{campaign.name}</span>
                    <span className="mt-1 block text-[11px] text-gray-400">{dateValue(campaign.startDate).slice(5)} — {dateValue(campaign.endDate).slice(5)}</span>
                    {campaign.goals.length > 0 && (
                      <span className="mt-2 flex flex-wrap gap-1">
                        {campaign.goals.map((goal) => <span key={goal} className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-600">{goal}</span>)}
                      </span>
                    )}
                  </span>
                  <span onClick={(e) => { e.stopPropagation(); deleteCampaign(campaign.id); }}
                    className="shrink-0 text-gray-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></span>
                </button>
              ))}
            </div>
          </section>

          {selected && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 font-semibold text-gray-900">Campaign 詳細資訊</h2>

              <label className="text-xs font-medium text-gray-600">Campaign 名稱</label>
              <input value={selected.name} onChange={(e) => updateCampaign({ name: e.target.value })}
                className="mb-4 mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">開始日期</label>
                  <input type="date" value={dateValue(selected.startDate)} onChange={(e) => updateCampaign({ startDate: e.target.value })}
                    className="mb-4 mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">結束日期</label>
                  <input type="date" value={dateValue(selected.endDate)} onChange={(e) => updateCampaign({ endDate: e.target.value })}
                    className="mb-4 mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
              </div>

              <label className="text-xs font-medium text-gray-600">Campaign 目標</label>
              <div className="mb-5 mt-2 flex flex-wrap gap-2">
                {MARKETING_GOALS.map((goal) => (
                  <button key={goal} onClick={() => updateCampaign({ goals: toggle(selected.goals, goal) })}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${selected.goals.includes(goal) ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>{goal}</button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600">關聯產品</label>
                <button onClick={() => setShowLibrary(true)} className="text-xs font-medium text-violet-600"><ImagePlus className="mr-1 inline h-3.5 w-3.5" />從素材庫選擇</button>
              </div>
              <div className="mb-5 mt-2 flex flex-wrap gap-2">
                {selected.products.length ? selected.products.map((product, i) => (
                  <div key={`${product.imageUrl}-${i}`} className="group relative h-16 w-16 overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.imageUrl} alt={product.label} className="h-full w-full object-cover" />
                    <button onClick={() => updateCampaign({ products: selected.products.filter((_, index) => index !== i) })}
                      className="absolute right-1 top-1 rounded bg-white/90 p-0.5 opacity-0 group-hover:opacity-100"><Trash2 className="h-3 w-3 text-red-500" /></button>
                  </div>
                )) : <div className="w-full rounded-lg border border-dashed px-3 py-4 text-xs text-gray-400">尚未關聯產品；品牌與教育型內容可保持空白。</div>}
              </div>

              <label className="text-xs font-medium text-gray-600">活動說明／補充</label>
              <textarea value={selected.description} onChange={(e) => updateCampaign({ description: e.target.value })} rows={3} maxLength={500}
                className="mb-5 mt-1 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="例如優惠機制、溝通重點、不可出現的內容…" />

              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600">重要日期</label>
                <button onClick={addImportantDate} className="text-xs font-medium text-violet-600"><Plus className="mr-1 inline h-3.5 w-3.5" />新增日期</button>
              </div>
              <div className="mt-2 space-y-2">
                {selected.importantDates.map((item, index) => (
                  <div key={item.id ?? index} className="grid grid-cols-[125px_1fr_28px] gap-2">
                    <input type="date" value={dateValue(item.date)} onChange={(e) => updateCampaign({ importantDates: selected.importantDates.map((d, i) => (i === index ? { ...d, date: e.target.value } : d)) })}
                      className="rounded-lg border px-2 py-2 text-xs" />
                    <input value={item.label} onChange={(e) => updateCampaign({ importantDates: selected.importantDates.map((d, i) => (i === index ? { ...d, label: e.target.value } : d)) })}
                      className="rounded-lg border px-2 py-2 text-xs" placeholder="例如新品上市" />
                    <button onClick={() => updateCampaign({ importantDates: selected.importantDates.filter((_, i) => i !== index) })} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {!selected.importantDates.length && (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-xs text-gray-400"><CalendarDays className="h-4 w-4" />尚未設定重要日期</div>
                )}
              </div>
            </section>
          )}

          {/* CTA：進入 ② AI 內容企劃 */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
            <p className="text-xs text-gray-400">設定完成後，讓 AI 依 Brief 規劃本月內容組合與 Topics。</p>
            <button onClick={goPlan} disabled={planning || !plan.goals.length}
              title={!plan.goals.length ? "請先選至少一個目標" : "產生本月內容策略"}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
              {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{planning ? "AI 規劃中…" : "AI 幫我規劃"}
            </button>
          </div>
        </div>
      </div>

      {showLibrary && selected && (
        <LibraryImagePickerModal clientId={plan.clientId} title="選擇 Campaign 產品"
          onPick={(url, promptText) => {
            if (!selected.products.some((p) => p.imageUrl === url)) updateCampaign({ products: [...selected.products, { label: promptText?.slice(0, 20) || "產品", imageUrl: url, sourceKind: "library" }] });
            setShowLibrary(false);
          }}
          onClose={() => setShowLibrary(false)} />
      )}
    </div>
  );
}
