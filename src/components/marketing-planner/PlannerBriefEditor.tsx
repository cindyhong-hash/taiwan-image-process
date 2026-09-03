"use client";
/**
 * ① 月度 Brief（Flow A，對齊 mockup + DESIGN.md 白卡片 v2）。
 * 單頁設定：本月目標 / 篇數 / 平台 + Campaign（展開設產品·說明·重要日期）+ 補充說明。
 * 自動儲存。底部 CTA「AI 幫我規劃」→ 產生策略並進 ② AI 內容企劃。
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Lightbulb, Loader2, MoreHorizontal, Package, Plus, Sparkles, Trash2 } from "lucide-react";
import { LibraryImagePickerModal } from "@/components/activities/LibraryImagePickerModal";
import { MARKETING_GOALS, MARKETING_PLATFORMS } from "@/lib/marketing-planner";

// lucide-react 這版已移除品牌 icon，改用內嵌 SVG，並用各自品牌色（IG 官方漸層 / FB 品牌藍）
const IgIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" className={className}>
    <defs>
      <linearGradient id="ig-brand-grad" x1="1" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#feda75" /><stop offset="0.35" stopColor="#fa7e1e" /><stop offset="0.6" stopColor="#d62976" /><stop offset="0.8" stopColor="#962fbf" /><stop offset="1" stopColor="#4f5bd5" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#ig-brand-grad)" />
    <circle cx="12" cy="12" r="4" stroke="url(#ig-brand-grad)" />
    <circle cx="17.3" cy="6.7" r="1.1" fill="url(#ig-brand-grad)" stroke="none" />
  </svg>
);
const FbIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="#1877F2" className={className}><path d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.25-1.52 1.55-1.52H17V4.6c-.3-.04-1.3-.13-2.46-.13-2.43 0-4.1 1.48-4.1 4.21v2.35H7.68V14h2.76v8h3.06z" /></svg>
);

type Product = { id?: string; label: string; imageUrl: string; sourceKind?: string; sourceId?: string | null };
type ImportantDate = { id?: string; date: string; label: string; note?: string };
type Campaign = { id: string; name: string; startDate: string; endDate: string; goals: string[]; description: string; sortOrder: number; products: Product[]; importantDates: ImportantDate[] };
type Plan = { id: string; clientId: string; year: number; month: number; goals: string[]; totalPostCount: number; platforms: string[]; status: string; notes: string; client: { id: string; name: string }; campaigns: Campaign[] };

const PLATFORM_STYLE = {
  Instagram: { Icon: IgIcon, on: "border-[#d62976] bg-[#fdf0f6] text-[#c13584]" },
  Facebook: { Icon: FbIcon, on: "border-[#1877F2] bg-[#eff5ff] text-[#1877F2]" },
} as const;
const dateValue = (value: string | Date) => new Date(value).toISOString().slice(0, 10);
const mmdd = (value: string | Date) => dateValue(value).slice(5).replace("-", "/");
const toggle = (items: string[], value: string) => (items.includes(value) ? items.filter((v) => v !== value) : [...items, value]);

export function PlannerBriefEditor({ initialPlan, hasTopics }: { initialPlan: Plan; hasTopics?: boolean }) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [openId, setOpenId] = useState("");            // 展開中的 Campaign（"" = 全收合，對齊 mockup）
  const [menuId, setMenuId] = useState("");            // 開啟 ⋯ 選單的 Campaign
  const [notesOpen, setNotesOpen] = useState(!!initialPlan.notes);
  const [customGoal, setCustomGoal] = useState(initialPlan.goals.find((g) => !MARKETING_GOALS.includes(g as typeof MARKETING_GOALS[number])) ?? "");
  const [showLibrary, setShowLibrary] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const skipFirst = useRef(true);
  const selected = plan.campaigns.find((c) => c.id === openId);

  const updatePlan = (patch: Partial<Plan>) => { setPlan((p) => ({ ...p, ...patch })); setSaveState("dirty"); };
  const updateCampaign = (patch: Partial<Campaign>) => { if (!selected) return; setPlan((p) => ({ ...p, campaigns: p.campaigns.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)) })); setSaveState("dirty"); };
  // 月份切換：不是改當前企劃的月份，而是導到「該月份自己的企劃」(有就載入、沒有就建立)。
  // 先存好當前 brief 再切，避免 debounce 未寫入就離開。
  const shiftMonth = async (delta: number) => {
    let y = plan.year, m = plan.month + delta; if (m < 1) { m = 12; y -= 1; } if (m > 12) { m = 1; y += 1; }
    if (saveState !== "saved") { setSaveState("saving"); await saveBrief(); setSaveState("saved"); }
    const res = await fetch(`/api/marketing-plans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: plan.clientId, year: y, month: m }) });
    const target = await res.json();
    if (target?.id) router.push(`/clients/${plan.clientId}/marketing-plans/${target.id}`);
  };
  const isPreset = (g: string) => MARKETING_GOALS.includes(g as typeof MARKETING_GOALS[number]);
  const otherOn = plan.goals.includes("其他");
  // 目標切換：一般預設照舊；「其他」關閉時連帶清掉自訂目標
  const toggleGoal = (goal: string) => {
    if (goal !== "其他") { updatePlan({ goals: toggle(plan.goals, goal) }); return; }
    if (otherOn) { setCustomGoal(""); updatePlan({ goals: plan.goals.filter((g) => isPreset(g) && g !== "其他") }); }
    else updatePlan({ goals: [...plan.goals, "其他"] });
  };
  // 自訂目標存成 goals 陣列中的非預設字串（AI 會直接讀到）
  const changeCustomGoal = (text: string) => {
    setCustomGoal(text);
    const base = plan.goals.filter((g) => isPreset(g));
    updatePlan({ goals: text.trim() ? [...base, text] : base });
  };

  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    if (saveState !== "dirty") return;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      await Promise.all([
        fetch(`/api/marketing-plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: plan.year, month: plan.month, goals: plan.goals, totalPostCount: plan.totalPostCount, platforms: plan.platforms, notes: plan.notes }) }),
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
    setOpenId(campaign.id);
  };
  const deleteCampaign = async (id: string) => {
    setMenuId("");
    if (plan.campaigns.length <= 1 || !confirm("確定刪除這個 Campaign？")) return;
    await fetch(`/api/marketing-campaigns/${id}`, { method: "DELETE" });
    const campaigns = plan.campaigns.filter((c) => c.id !== id);
    setPlan((p) => ({ ...p, campaigns }));
    if (openId === id) setOpenId("");
  };
  const addImportantDate = () => updateCampaign({ importantDates: [...(selected?.importantDates ?? []), { date: dateValue(selected?.startDate ?? new Date()), label: "重要日期", note: "" }] });

  // 立即把 Brief 存檔（不等 debounce）
  const saveBrief = async () => {
    await fetch(`/api/marketing-plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: plan.year, month: plan.month, goals: plan.goals, totalPostCount: plan.totalPostCount, platforms: plan.platforms, notes: plan.notes }) });
    await Promise.all(plan.campaigns.map((c) => fetch(`/api/marketing-campaigns/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: c.name, startDate: c.startDate, endDate: c.endDate, goals: c.goals, description: c.description, sortOrder: c.sortOrder, products: c.products, importantDates: c.importantDates }) })));
  };
  // 首次規劃 / 重新規劃：存檔 → 產生策略 → 進 ②
  const goPlan = async () => {
    if (planning) return;
    setPlanning(true);
    try {
      await saveBrief();
      await fetch(`/api/marketing-plans/${plan.id}/strategy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    } catch { /* 策略失敗 ② 頁仍可手動重試 */ }
    router.push(`/clients/${plan.clientId}/marketing-plans/${plan.id}/plan`);
  };
  // 已規劃過：只存檔 → 進 ②，不重產策略/topics（保留上次成果）
  const continueToPlan = async () => {
    if (planning) return;
    setPlanning(true);
    try { await saveBrief(); } catch { /* 忽略，仍可進頁 */ }
    router.push(`/clients/${plan.clientId}/marketing-plans/${plan.id}/plan`);
  };

  const pill = (on: boolean) => `rounded-lg border-[1.5px] px-3 py-2 text-sm transition-colors ${on ? "border-violet-600 bg-violet-50 text-violet-700" : "border-[#ebeff5] bg-white text-gray-500 hover:border-violet-300"}`;

  return (
    <div className="w-full">
      <button onClick={() => router.push(`/clients/${plan.clientId}/marketing-plans`)} className="mb-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"><ChevronLeft className="h-3.5 w-3.5" />返回月度企劃</button>
      {/* 頁首 + 月份切換 */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{plan.year} 年 {plan.month} 月內容企劃</h1>
          <p className="mt-1 text-sm text-gray-400">設定這個月的重點，AI 會為你規劃內容主題與排程。</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{saveState === "saving" ? "儲存中…" : saveState === "dirty" ? "等待儲存" : "已自動儲存"}</span>
          <div className="flex items-center gap-1 rounded-lg border border-[#ebeff5] bg-white p-1">
            <button onClick={() => shiftMonth(-1)} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700"><ChevronLeft className="h-4 w-4" /></button>
            <span className="flex items-center gap-1.5 px-2 text-sm font-medium text-gray-900"><Calendar className="h-3.5 w-3.5 text-gray-400" />{plan.year} 年 {plan.month} 月</span>
            <button onClick={() => shiftMonth(1)} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* 本月目標：目標 | 篇數 + 平台 */}
      <section className="mb-4 rounded-2xl border border-[#ebeff5] bg-white p-6 sm:p-8">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="mb-3 text-sm font-bold text-gray-900">本月目標 <span className="font-normal text-gray-400">（可多選）</span></div>
            <div className="flex flex-wrap gap-2">
              {MARKETING_GOALS.map((goal) => (
                <button key={goal} onClick={() => toggleGoal(goal)} className={pill(plan.goals.includes(goal))}>
                  {plan.goals.includes(goal) && <Check className="mr-1 inline h-3.5 w-3.5" />}{goal}
                </button>
              ))}
            </div>
            {otherOn && (
              <input value={customGoal} onChange={(e) => changeCustomGoal(e.target.value)} maxLength={30}
                className="mt-3 h-10 w-full rounded-lg border-[1.5px] border-[#ebeff5] px-3 text-sm focus:ring-2 focus:ring-ring"
                placeholder="輸入自訂目標，例如：清庫存、蒐集 UGC…" />
            )}
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-3 text-sm font-bold text-gray-900">預計內容數量</div>
              <div className="flex items-center gap-3">
                <button onClick={() => updatePlan({ totalPostCount: Math.max(1, plan.totalPostCount - 1) })} className="flex h-10 w-10 items-center justify-center rounded-lg border-[1.5px] border-[#ebeff5] text-gray-600 hover:bg-gray-50">−</button>
                <span className="w-12 text-center text-lg font-bold text-gray-900">{plan.totalPostCount}</span>
                <button onClick={() => updatePlan({ totalPostCount: Math.min(60, plan.totalPostCount + 1) })} className="flex h-10 w-10 items-center justify-center rounded-lg border-[1.5px] border-[#ebeff5] text-gray-600 hover:bg-gray-50">+</button>
                <span className="text-sm text-gray-400">篇</span>
              </div>
            </div>
            <div>
              <div className="mb-3 text-sm font-bold text-gray-900">發布平台 <span className="font-normal text-gray-400">（可多選）</span></div>
              <div className="flex gap-3">
                {MARKETING_PLATFORMS.map((platform) => {
                  const { Icon, on: onCls } = PLATFORM_STYLE[platform as keyof typeof PLATFORM_STYLE];
                  const on = plan.platforms.includes(platform);
                  return (
                    <button key={platform} onClick={() => updatePlan({ platforms: toggle(plan.platforms, platform) })}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-[1.5px] px-3 py-2.5 text-sm font-medium transition-colors ${on ? onCls : "border-[#ebeff5] bg-white text-gray-500 hover:border-gray-300"}`}>
                      <Icon className="h-4 w-4" />{platform}{on && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Campaign 清單（展開設定） */}
      <section className="mb-4 rounded-2xl border border-[#ebeff5] bg-white p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">這個月有哪些 Campaign？</h2>
            <p className="mt-1 text-xs text-gray-400">將為 Campaign 規劃合適的內容主題與時程。</p>
          </div>
          <button onClick={addCampaign} className="rounded-lg border-[1.5px] border-violet-200 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50"><Plus className="mr-1 inline h-3.5 w-3.5" />新增 Campaign</button>
        </div>

        <div className="space-y-3">
          {plan.campaigns.map((campaign) => {
            const open = openId === campaign.id;
            const thumb = campaign.products[0]?.imageUrl;
            return (
              <div key={campaign.id} className={`rounded-2xl border-[1.5px] transition-colors ${open ? "border-violet-300" : "border-[#ebeff5]"}`}>
                {/* 卡片頭列（可點展開）; 不用 overflow-hidden 以免裁切 ⋯ 選單 */}
                <div role="button" tabIndex={0} onClick={() => setOpenId(open ? "" : campaign.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(open ? "" : campaign.id); } }}
                  className={`flex cursor-pointer items-center gap-4 p-4 hover:bg-gray-50/60 ${open ? "rounded-t-2xl" : "rounded-2xl"}`}>
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#ebeff5] bg-gray-50">
                    {thumb
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={thumb} alt={campaign.name} className="h-full w-full object-cover" />
                      : <div className="flex h-full w-full items-center justify-center text-gray-300"><Package className="h-6 w-6" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-gray-900">{campaign.name}</span>
                      {campaign.goals.slice(0, 2).map((goal) => <span key={goal} className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-600">{goal}</span>)}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400"><Calendar className="h-3 w-3" />{dateValue(campaign.startDate)} – {dateValue(campaign.endDate)}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1"><Package className="h-3 w-3" />{campaign.products.length} 個產品</span>
                      <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{campaign.importantDates.length} 個重要日期</span>
                    </div>
                  </div>
                  <div className="relative shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === campaign.id ? "" : campaign.id); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><MoreHorizontal className="h-4 w-4" /></button>
                    {menuId === campaign.id && (
                      <>
                        <button className="fixed inset-0 z-10 cursor-default" aria-label="關閉選單" onClick={(e) => { e.stopPropagation(); setMenuId(""); }} />
                        <div className="absolute right-0 top-9 z-20 w-32 overflow-hidden rounded-lg border border-[#ebeff5] bg-white py-1 shadow-md">
                          <button onClick={(e) => { e.stopPropagation(); setMenuId(""); setOpenId(open ? "" : campaign.id); }} className="block w-full px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-50">{open ? "收合" : "展開設定"}</button>
                          <button onClick={(e) => { e.stopPropagation(); deleteCampaign(campaign.id); }} className="block w-full px-3 py-2 text-left text-xs text-red-500 hover:bg-red-50">刪除</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 展開：詳細設定 */}
                {open && selected && (
                  <div className="space-y-5 border-t border-[#ebeff5] p-4 sm:p-5">
                    <div>
                      <label className="text-xs font-bold text-gray-900">Campaign 名稱</label>
                      <input value={selected.name} onChange={(e) => updateCampaign({ name: e.target.value })} className="mt-1 h-11 w-full rounded-lg border-[1.5px] border-[#ebeff5] px-3 text-sm focus:ring-2 focus:ring-ring" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs font-bold text-gray-900">開始日期</label><input type="date" value={dateValue(selected.startDate)} onChange={(e) => updateCampaign({ startDate: e.target.value })} className="mt-1 h-11 w-full rounded-lg border-[1.5px] border-[#ebeff5] px-3 text-sm focus:ring-2 focus:ring-ring" /></div>
                      <div><label className="text-xs font-bold text-gray-900">結束日期</label><input type="date" value={dateValue(selected.endDate)} onChange={(e) => updateCampaign({ endDate: e.target.value })} className="mt-1 h-11 w-full rounded-lg border-[1.5px] border-[#ebeff5] px-3 text-sm focus:ring-2 focus:ring-ring" /></div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-900">Campaign 目標</label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {MARKETING_GOALS.map((goal) => (
                          <button key={goal} onClick={() => updateCampaign({ goals: toggle(selected.goals, goal) })} className={`rounded-lg border-[1.5px] px-2.5 py-1.5 text-xs transition-colors ${selected.goals.includes(goal) ? "border-violet-600 bg-violet-50 text-violet-700" : "border-[#ebeff5] bg-white text-gray-500 hover:border-violet-300"}`}>{goal}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-gray-900">關聯產品</label>
                        <button onClick={() => setShowLibrary(true)} className="text-xs font-medium text-violet-600"><ImagePlus className="mr-1 inline h-3.5 w-3.5" />從素材庫選擇</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selected.products.length ? selected.products.map((product, i) => (
                          <div key={`${product.imageUrl}-${i}`} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-[#ebeff5]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={product.imageUrl} alt={product.label} className="h-full w-full object-cover" />
                            <button onClick={() => updateCampaign({ products: selected.products.filter((_, index) => index !== i) })} className="absolute right-1 top-1 rounded bg-white/90 p-0.5 opacity-0 group-hover:opacity-100"><Trash2 className="h-3 w-3 text-red-500" /></button>
                          </div>
                        )) : <div className="w-full rounded-lg border border-dashed border-[#ebeff5] px-3 py-4 text-xs text-gray-400">尚未關聯產品；品牌與教育型內容可保持空白。</div>}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-900">活動說明／補充</label>
                      <textarea value={selected.description} onChange={(e) => updateCampaign({ description: e.target.value })} rows={3} maxLength={500} className="mt-1 w-full resize-y rounded-lg border-[1.5px] border-[#ebeff5] px-3 py-2 text-sm focus:ring-2 focus:ring-ring" placeholder="例如優惠機制、溝通重點、不可出現的內容…" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-gray-900">重要日期</label>
                        <button onClick={addImportantDate} className="text-xs font-medium text-violet-600"><Plus className="mr-1 inline h-3.5 w-3.5" />新增日期</button>
                      </div>
                      <div className="mt-2 space-y-2">
                        {selected.importantDates.map((item, index) => (
                          <div key={item.id ?? index} className="grid grid-cols-[125px_1fr_28px] gap-2">
                            <input type="date" value={dateValue(item.date)} onChange={(e) => updateCampaign({ importantDates: selected.importantDates.map((d, i) => (i === index ? { ...d, date: e.target.value } : d)) })} className="rounded-lg border-[1.5px] border-[#ebeff5] px-2 py-2 text-xs focus:ring-2 focus:ring-ring" />
                            <input value={item.label} onChange={(e) => updateCampaign({ importantDates: selected.importantDates.map((d, i) => (i === index ? { ...d, label: e.target.value } : d)) })} className="rounded-lg border-[1.5px] border-[#ebeff5] px-2 py-2 text-xs focus:ring-2 focus:ring-ring" placeholder="例如新品上市" />
                            <button onClick={() => updateCampaign({ importantDates: selected.importantDates.filter((_, i) => i !== index) })} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        ))}
                        {!selected.importantDates.length && <div className="flex items-center gap-2 rounded-lg border border-dashed border-[#ebeff5] px-3 py-4 text-xs text-gray-400"><CalendarDays className="h-4 w-4" />尚未設定重要日期</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={addCampaign} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#ebeff5] py-4 text-sm font-medium text-gray-500 hover:border-violet-300 hover:text-violet-600"><Plus className="h-4 w-4" />新增 Campaign</button>
        </div>
      </section>

      {/* 補充說明（選填，收合） */}
      <section className="mb-6 rounded-2xl border border-[#ebeff5] bg-white">
        <button onClick={() => setNotesOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-5 text-left">
          <span className="flex items-center gap-2 text-sm font-bold text-gray-900"><Lightbulb className="h-4 w-4 text-amber-500" />補充說明 <span className="font-normal text-gray-400">（選填）</span></span>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${notesOpen ? "" : "-rotate-90"}`} />
        </button>
        {notesOpen && (
          <div className="px-5 pb-5">
            <textarea value={plan.notes} onChange={(e) => updatePlan({ notes: e.target.value })} rows={3} maxLength={500} className="w-full resize-y rounded-lg border-[1.5px] border-[#ebeff5] px-3 py-2 text-sm focus:ring-2 focus:ring-ring" placeholder="優惠機制、溝通重點、不可出現的內容等…（會作為 AI 規劃參考）" />
          </div>
        )}
      </section>

      {/* 主要 CTA（置中大圓角，依 DESIGN.md）；已規劃過 → 繼續（不重產），未規劃 → AI 規劃 */}
      <div className="flex flex-col items-center gap-2 pt-1">
        {hasTopics ? (
          <>
            <button onClick={continueToPlan} disabled={planning || !plan.goals.length}
              title={!plan.goals.length ? "請先選至少一個目標" : "回到內容企劃繼續編輯（不會重新產生）"}
              className="inline-flex h-auto items-center justify-center gap-2 rounded-full bg-violet-600 px-16 py-4 text-base font-bold text-white shadow-[0_8px_8px_rgba(124,58,237,0.15)] transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
              {planning ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : null}繼續內容企劃 →
            </button>
            <button onClick={goPlan} disabled={planning} className="text-xs text-gray-400 underline-offset-2 hover:text-violet-600 hover:underline">
              或重新用 AI 規劃（會重新產生策略，已編輯與已製作的主題不受影響）
            </button>
          </>
        ) : (
          <>
            <button onClick={goPlan} disabled={planning || !plan.goals.length}
              title={!plan.goals.length ? "請先選至少一個目標" : "產生本月內容策略"}
              className="inline-flex h-auto items-center justify-center gap-2 rounded-full bg-violet-600 px-16 py-4 text-base font-bold text-white shadow-[0_8px_8px_rgba(124,58,237,0.15)] transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
              {planning ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Sparkles className="h-[18px] w-[18px]" />}{planning ? "AI 規劃中…" : `AI 幫我規劃 ${plan.totalPostCount} 篇內容`}
            </button>
            <p className="text-xs text-gray-400">AI 將生成主題、內容策略與建議排程</p>
          </>
        )}
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
