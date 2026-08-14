"use client";
import { useEffect, useState, useRef } from "react";
import { LayoutPicker } from "@/components/activities/LayoutPicker";
import { Loader2, Pencil, SlidersHorizontal, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type GeneratedLayout = { id: string; layoutType: string; imageUrl: string; copyText: string; textBurnedIn?: boolean; savedToLibrary?: boolean };
type Activity = { id: string; theme: string; focusPoint: string; titleText?: string | null; status: string; layoutId?: string; variantCount?: number; generatedLayouts: GeneratedLayout[] };

export default function ActivityPage({ params }: { params: Promise<{ clientId: string; activityId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const [activityId, setActivityId] = useState<string>("");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationTriggered = useRef(false);

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
            const n = isMulti ? (activity.variantCount === 2 ? 2 : 1) : 3;
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
        href={`/clients/${clientId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3"
      >
        <ArrowLeft className="h-4 w-4" />返回活動列表
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
              <Button size="sm" className="gap-1">
                <SlidersHorizontal className="h-4 w-4" />進入微調畫布 →
              </Button>
            </Link>
          )}
          {/* [MULTI] 多圖 → editHref 導多圖頁還原填寫；單圖 → 他的編輯頁 */}
          <Link href={editHref}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-1" />編輯 / 重新生成
            </Button>
          </Link>
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-6">{activity.focusPoint}</p>
      <LayoutPicker
        layouts={activity.generatedLayouts}
        selectedId={selectedId}
        activityId={activityId}
        clientId={clientId}
        hasLockedText={!!activity.titleText?.trim()}
        onSelect={handleSelect}
      />
    </div>
  );
}
