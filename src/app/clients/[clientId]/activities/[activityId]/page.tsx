"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { LayoutPicker } from "@/components/activities/LayoutPicker";
import { CalendarPlus, Check, Loader2, Pencil, SlidersHorizontal, ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type GeneratedLayout = { id: string; layoutType: string; imageUrl: string; copyText: string; isSelected?: boolean; textBurnedIn?: boolean; savedToLibrary?: boolean; effectLevel?: string | null; cellImageUrls?: string };
type Activity = { id: string; theme: string; focusPoint: string; titleText?: string | null; status: string; layoutId?: string; genMode?: string; variantCount?: number; generatedLayouts: GeneratedLayout[]; client?: { name: string }; plannerItem?: { id: string; monthlyPlanId: string; status: string } | null };

export default function ActivityPage({ params }: { params: Promise<{ clientId: string; activityId: string }> }) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  // B：把這張作品/設計稿指派到某月度企劃的某篇主題
  const [showAssign, setShowAssign] = useState(false);
  const [assignPlans, setAssignPlans] = useState<{ id: string; year: number; month: number }[]>([]);
  const [assignPlanId, setAssignPlanId] = useState("");
  const [assignTopics, setAssignTopics] = useState<{ id: string; topic: string; status: string }[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [clientId, setClientId] = useState<string>("");
  const [activityId, setActivityId] = useState<string>("");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationTriggered = useRef(false);

  // 結果頁核准：把連動的 planner topic 標記已完成，回內容日曆（Flow A ⑤ Review 收尾）
  const approveAndBackToCalendar = async () => {
    if (!activity?.plannerItem || approving || !selectedId) return;
    setApproving(true);
    try {
      // 確保選定那張已持久化 isSelected（自動選單一版型時可能還沒 PATCH），日曆縮圖才會對。
      if (!activity.generatedLayouts.find((l) => l.id === selectedId)?.isSelected) {
        await handleSelect(selectedId);
      }
      await fetch(`/api/content-plan-items/${activity.plannerItem.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      router.push(`/clients/${clientId}/marketing-plans/${activity.plannerItem.monthlyPlanId}/calendar`);
    } catch { setApproving(false); }
  };

  const loadAssignTopics = async (planId: string) => {
    setAssignPlanId(planId); setAssignTopics([]);
    if (!planId) return;
    try {
      const p = await fetch(`/api/marketing-plans/${planId}`).then((r) => r.json());
      setAssignTopics((p?.contentItems ?? []).map((t: { id: string; topic: string; status: string }) => ({ id: t.id, topic: t.topic, status: t.status })));
    } catch { /* ignore */ }
  };
  const openAssign = async () => {
    setShowAssign(true); setAssignLoading(true);
    try {
      const plans = await fetch(`/api/marketing-plans?clientId=${clientId}`).then((r) => r.json());
      const list = (plans ?? []).map((p: { id: string; year: number; month: number }) => ({ id: p.id, year: p.year, month: p.month }));
      setAssignPlans(list);
      if (list[0]) await loadAssignTopics(list[0].id);
    } catch { /* ignore */ }
    finally { setAssignLoading(false); }
  };
  const assignTopic = async (itemId: string) => {
    setAssigning(true);
    try {
      const r = await fetch(`/api/content-plan-items/${itemId}/attach`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId }) });
      if (!r.ok) throw new Error();
      router.push(`/clients/${clientId}/marketing-plans/${assignPlanId}/calendar`);
    } catch { setAssigning(false); }
  };

  const saveTitle = async () => {
    const v = titleDraft.trim();
    setEditingTitle(false);
    if (!v || !activity || v === activity.theme) return;
    setActivity((prev) => (prev ? { ...prev, theme: v } : prev));
    await fetch(`/api/activities/${activityId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: v }),
    });
  };

  useEffect(() => {
    params.then(({ clientId, activityId }) => {
      setClientId(clientId);
      setActivityId(activityId);
    });
  }, [params]);

  useEffect(() => {
    if (!activityId) return;

    const fetchActivity = () => {
      fetch(`/api/activities/${activityId}`)
        .then((r) => r.json())
        .then((data: Activity) => {
          setActivity(data);

          // 還原先前選定的版型：優先取已持久化的 isSelected，只有一款則自動選它。
          // 用 prev ?? 避免蓋掉使用者當下的點選。
          setSelectedId((prev) => prev ?? (data.generatedLayouts?.find((l) => l.isSelected)?.id
            ?? (data.generatedLayouts?.length === 1 ? data.generatedLayouts[0].id : undefined)));

          // If PENDING and not yet triggered, kick off generation
          if (data.status === "PENDING" && !generationTriggered.current) {
            generationTriggered.current = true;
            fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ activityId }),
            });
          }

          if (data.status === "GENERATING" || data.status === "PENDING") {
            pollingRef.current = setTimeout(fetchActivity, 3000);
          }
          // DONE but no layouts → was just reset, re-trigger generation
          if (data.status === "DONE" && data.generatedLayouts?.length === 0 && !generationTriggered.current) {
            generationTriggered.current = true;
            fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ activityId }),
            }).then(() => {
              pollingRef.current = setTimeout(fetchActivity, 3000);
            });
          }
          // FAILED — stop polling (UI will show error state)
        });
    };

    fetchActivity();
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [activityId]);

  const handleSelect = async (layoutId: string) => {
    setSelectedId(layoutId);
    // 先把其他版型的 isSelected 清掉，再設定選中的版型
    // 確保 editor page 的 find((l) => l.isSelected) 只會拿到正確的那張
    const others = activity?.generatedLayouts.filter((l) => l.id !== layoutId) ?? [];
    await Promise.all([
      ...others.map((l) =>
        fetch(`/api/layouts/${l.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isSelected: false }),
        })
      ),
      fetch(`/api/layouts/${layoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSelected: true }),
      }),
    ]);
  };

  if (!activity) return <div className="text-gray-400">載入中...</div>;

  // [MULTI] 多圖活動 → 編輯導去多圖頁(edit 模式)，還原原本填寫；單圖走他的編輯頁
  const editHref = activity.layoutId && activity.layoutId !== "single"
    ? `/clients/${clientId}/activities/new/multi?edit=${activityId}`
    : `/clients/${clientId}/activities/${activityId}/edit`;

  if (
    activity.status === "GENERATING" ||
    activity.status === "PENDING" ||
    (activity.status === "DONE" && activity.generatedLayouts?.length === 0)
  ) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <div className="font-medium">
          {(() => {
            // 多圖：款數＝生成組數（variantCount）；單圖：固定 3 款(A/B/C)
            const isMulti = !!activity.layoutId && activity.layoutId !== "single";
            const n = isMulti ? (activity.variantCount === 2 ? 2 : 1) : (activity.genMode === "quick" ? (activity.variantCount ?? 3) : 3);
            const cn = ["", "一", "兩", "三"][n] ?? String(n);
            return `AI 正在生成${cn}款版型，請稍候...`;
          })()}
        </div>
        <div className="text-sm text-gray-400">通常需要 30–60 秒</div>
      </div>
    );
  }

  if (activity.status === "FAILED") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-3xl">⚠️</div>
        <div className="font-medium text-gray-700">生成失敗</div>
        <div className="text-sm text-gray-400 text-center max-w-sm">
          AI 圖片生成失敗（可能係 API 額度／逾時／網路問題）。<br />
          文案仍可重試。
        </div>
        <Link href={editHref}>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-1" />重新生成
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={activity.plannerItem ? `/clients/${clientId}/marketing-plans/${activity.plannerItem.monthlyPlanId}/calendar` : `/clients/${clientId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 border border-gray-200 bg-white rounded-lg px-3 py-1.5 hover:bg-gray-50 hover:text-gray-800 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />{activity.plannerItem ? "返回內容日曆" : "返回活動列表"}
      </Link>
      <div className="flex items-center justify-between mb-1">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
            className="text-xl font-semibold border-b border-violet-400 outline-none bg-transparent flex-1 mr-4"
          />
        ) : (
          <h1
            className="text-xl font-semibold cursor-text hover:bg-gray-50 rounded px-1 -mx-1"
            title="撳一下改活動名稱"
            onClick={() => { setTitleDraft(activity.theme); setEditingTitle(true); }}
          >
            {activity.theme}
          </h1>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {/* 選中一款先出現：頂部主 CTA，永遠喺視線頂、唔使 scroll（取代浮動 FAB）*/}
          {selectedId && (
            <Link href={`/clients/${clientId}/activities/${activityId}/editor`}>
              <Button size="sm" className="gap-1 bg-violet-600 hover:bg-violet-700 text-white">
                <SlidersHorizontal className="h-4 w-4" />進入微調畫布
              </Button>
            </Link>
          )}
          {/* [MULTI] 多圖 → editHref 導多圖頁還原填寫；單圖 → 他的編輯頁 */}
          <Link href={editHref}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-1" />編輯 / 重新生成
            </Button>
          </Link>
          {/* Flow A ⑤：屬於月度企劃、已生成、尚未核准 → 一鍵核准並回日曆 */}
          {activity.plannerItem && activity.status === "DONE" && activity.plannerItem.status !== "APPROVED" && (
            <Button size="sm" onClick={approveAndBackToCalendar} disabled={approving || !selectedId}
              title={selectedId ? "核准選定的版型並回內容日曆" : "請先選一款版型"}
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {selectedId ? "核准並回日曆" : "選一款後核准"}
            </Button>
          )}
          {/* B：尚未屬於任何企劃、已有成品 → 指派到月度企劃某篇 */}
          {!activity.plannerItem && activity.generatedLayouts.length > 0 && (
            <Button variant="outline" size="sm" onClick={openAssign} className="gap-1">
              <CalendarPlus className="h-4 w-4" />指派到企劃
            </Button>
          )}
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-6">選擇一款版型</p>
      <LayoutPicker
        layouts={activity.generatedLayouts}
        selectedId={selectedId}
        activityId={activityId}
        clientId={clientId}
        clientName={activity.client?.name}
        onSelect={handleSelect}
      />

      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="取消" onClick={() => setShowAssign(false)} className="absolute inset-0 cursor-default bg-gray-950/25 backdrop-blur-[1px]" />
          <div role="dialog" aria-modal="true" className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div><h2 className="text-lg font-bold text-gray-900">指派到月度企劃</h2><p className="mt-1 text-xs text-gray-400">把這張作品掛到某份企劃的一篇主題，之後可在內容日曆審核。</p></div>
              <button aria-label="關閉" onClick={() => setShowAssign(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
            </div>
            {assignLoading ? (
              <div className="flex justify-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : assignPlans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">這個品牌還沒有月度企劃。</div>
            ) : (
              <>
                <label className="text-xs font-medium text-gray-600">選擇企劃</label>
                <select value={assignPlanId} onChange={(e) => loadAssignTopics(e.target.value)} className="mb-4 mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {assignPlans.map((p) => <option key={p.id} value={p.id}>{p.year} 年 {p.month} 月企劃</option>)}
                </select>
                <label className="text-xs font-medium text-gray-600">選擇要掛上的主題</label>
                <div className="mt-2 flex-1 space-y-2 overflow-y-auto">
                  {assignTopics.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">這份企劃還沒有主題。</div>
                  ) : assignTopics.map((t) => (
                    <button key={t.id} disabled={assigning} onClick={() => assignTopic(t.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm hover:border-violet-300 hover:bg-violet-50/40 disabled:opacity-50">
                      <span className="truncate text-gray-800">{t.topic}</span>
                      <span className="shrink-0 text-[11px] text-gray-400">{t.status === "APPROVED" ? "已完成" : t.status === "NEEDS_REVIEW" ? "待審核" : t.status === "PLANNING" ? "尚未製作" : "製作中"}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {assigning && <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/60"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>}
          </div>
        </div>
      )}
    </div>
  );
}
