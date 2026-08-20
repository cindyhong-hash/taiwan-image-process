"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Search, CheckCircle2, Circle, X, Image as ImageIcon } from "lucide-react";
import { BrandWorkspaceHeader } from "@/components/layout/BrandWorkspaceHeader";
import { BrandMemoryCards } from "@/components/clients/BrandMemoryCards";
import { getMultiLayout } from "@/types/multiLayout";

type Activity = { id: string; theme: string; focusPoint: string; status: string; createdAt: string; imageRatio?: string; customW?: number; customH?: number; layoutId?: string; generatedLayouts?: { imageUrl: string; isSelected?: boolean }[] };
type Client = {
  id: string; name: string; activities: Activity[];
  // 品牌記憶卡用（/api/clients/[id] 已一併返）
  primaryColor?: string; secondaryColor?: string | null; paletteColors?: unknown;
  toneLabels?: string[]; taboos?: string[];
};
type ClientOption = { id: string; name: string };

// 狀態標籤：按狀態上色（補返 FAILED；唔好再用黑色 default badge）。
const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING:    { label: "待生成", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  GENERATING: { label: "生成中", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  DONE:       { label: "已完成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  FAILED:     { label: "生成失敗", cls: "bg-red-50 text-red-600 border-red-200" },
};

// 長按（~0.5s）入多選：同素材庫畫廊嗰套一致嘅手勢。pointer 事件兼容滑鼠 + 觸控。
function ActivityRow({
  act, selectMode, selected, deletingId,
  onOpen, onToggleSelect, onLongPress, onDelete,
}: {
  act: Activity; selectMode: boolean; selected: boolean; deletingId: string | null;
  onOpen: () => void; onToggleSelect: () => void; onLongPress: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const startPress = () => {
    longFired.current = false;
    pressTimer.current = setTimeout(() => { longFired.current = true; onLongPress(); }, 500);
  };
  const cancelPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
  // [UX] 列表縮圖：優先選中款、否則最新一張
  const thumb = act.generatedLayouts?.find((l) => l.isSelected)?.imageUrl ?? act.generatedLayouts?.[0]?.imageUrl;

  return (
    <div
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longFired.current) { longFired.current = false; return; }
        if (selectMode) onToggleSelect(); else onOpen();
      }}
      style={{ touchAction: "manipulation" }}
      className="group flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all gap-3 select-none"
    >
      <div className="flex items-center gap-3 min-w-0">
      {selectMode && (
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(); }}
          className="shrink-0" title={selected ? "取消選取" : "選取"}>
          {selected
            ? <CheckCircle2 className="h-5 w-5 text-violet-600" />
            : <Circle className="h-5 w-5 text-gray-300" />}
        </button>
      )}
      {/* [UX] 成品縮圖：讓活動列表也「看得到」成品，和素材庫一致 */}
      <div className="shrink-0 h-14 w-14 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
        {thumb
          ? <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
          : <ImageIcon className="h-5 w-5 text-gray-300" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{act.theme}</div>
        {/* [UX] 副標和標題常一樣 → 只在真的不同時才顯示，去重複、降列高 */}
        {act.focusPoint && act.focusPoint !== act.theme && (
          <div className="text-xs text-gray-400 mt-0.5 truncate">{act.focusPoint}</div>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">
            {new Date(act.createdAt).toLocaleDateString("zh-TW")}
          </span>
          {act.layoutId && act.layoutId !== "single" ? (
            <span className="text-[11px] font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
              多圖・{getMultiLayout(act.layoutId)?.label ?? act.layoutId}
            </span>
          ) : act.imageRatio && (
            <span className="text-[11px] font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
              {act.imageRatio}{act.customW && act.customH ? ` · ${act.customW}×${act.customH}` : ""}
            </span>
          )}
        </div>
      </div>
      </div>
      <div className="flex items-center gap-2">
        {(() => {
          const s = STATUS_META[act.status] ?? { label: act.status || "—", cls: "bg-gray-100 text-gray-500 border-gray-200" };
          return <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>;
        })()}
        {!selectMode && (
          <button
            onClick={onDelete}
            disabled={deletingId === act.id}
            title="刪除活動"
            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ClientFolderPage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string>("");
  const [client, setClient] = useState<Client | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // [WIP-only] our edit — 活動 list 搜尋 + 狀態篩選（同事 廣告活動圖 功能區客製，勿 merge 入公司 repo）
  const [actSearch, setActSearch] = useState("");
  const [actStatus, setActStatus] = useState<string>("ALL");

  // 多選 / 批次操作（移到其他品牌 · 批次刪除）—— 同素材庫畫廊嗰套一致。
  const [clientsList, setClientsList] = useState<ClientOption[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  useEffect(() => {
    params.then(({ clientId }) => {
      setClientId(clientId);
      fetch(`/api/clients/${clientId}`).then((r) => r.json()).then(setClient);
    });
    fetch("/api/clients").then((r) => r.json()).then(setClientsList).catch(() => {});
  }, [params]);

  const handleDelete = async (e: React.MouseEvent, activityId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("確定要刪除這個活動？此操作無法復原。")) return;
    setDeletingId(activityId);
    await fetch(`/api/activities/${activityId}`, { method: "DELETE" });
    setClient((prev) =>
      prev ? { ...prev, activities: prev.activities.filter((a) => a.id !== activityId) } : prev
    );
    setDeletingId(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); setConfirmBatchDelete(false); };

  const runBatchMove = async (targetClientId: string) => {
    if (selectedIds.size === 0 || batchBusy || !targetClientId) return;
    setBatchBusy(true);
    try {
      await Promise.all([...selectedIds].map((id) =>
        fetch(`/api/activities/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: targetClientId }),
        })
      ));
      // 移咗去第二個品牌 → 喺呢個品牌嘅列表消失。
      setClient((prev) => prev ? { ...prev, activities: prev.activities.filter((a) => !selectedIds.has(a.id)) } : prev);
      exitSelect();
    } finally {
      setBatchBusy(false);
    }
  };

  const runBatchDelete = async () => {
    if (selectedIds.size === 0 || batchBusy) return;
    setBatchBusy(true);
    try {
      await Promise.all([...selectedIds].map((id) => fetch(`/api/activities/${id}`, { method: "DELETE" })));
      setClient((prev) => prev ? { ...prev, activities: prev.activities.filter((a) => !selectedIds.has(a.id)) } : prev);
      exitSelect();
    } finally {
      setBatchBusy(false);
    }
  };

  if (!client) return <div className="text-gray-400">載入中...</div>;

  return (
    <div>
      <BrandWorkspaceHeader clientId={clientId} activeTab="activities" name={client.name} />

      <BrandMemoryCards clientId={clientId} data={client} />

      {client.activities.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          還沒有活動，點右上角「新增活動」開始
        </div>
      ) : (
        <>
          {/* [WIP-only] our edit — 活動 list 搜尋 + 狀態篩選 + 明顯卡片風格（自然陰影）。勿 merge 入公司 repo。 */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={actSearch} onChange={(e) => setActSearch(e.target.value)}
                placeholder="搜尋活動主題 / 訴求…"
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {/* 揀中時用返狀態 tag 嘅顏色（同列表 badge 一致）；全部=黑；未揀=白 */}
              {[{ k: "ALL", label: "全部" }, { k: "DONE", label: "已完成" }, { k: "GENERATING", label: "生成中" }, { k: "FAILED", label: "生成失敗" }, { k: "PENDING", label: "待生成" }].map((f) => {
                const selected = actStatus === f.k;
                const selCls = f.k === "ALL" ? "bg-violet-600 text-white border-violet-600" : (STATUS_META[f.k]?.cls ?? "bg-violet-600 text-white border-violet-600");
                return (
                  <button key={f.k} onClick={() => setActStatus(f.k)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${selected ? selCls : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"}`}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 批次操作工具列（多選後出現）：全選 / 移到其他品牌 / 批次刪除 / 完成 */}
          {selectMode && (() => {
            const acts0 = client.activities.filter((a) =>
              (actStatus === "ALL" || a.status === actStatus) &&
              (!actSearch.trim() || `${a.theme} ${a.focusPoint}`.toLowerCase().includes(actSearch.toLowerCase())));
            const allVisibleSelected = acts0.length > 0 && acts0.every((a) => selectedIds.has(a.id));
            const otherClients = clientsList.filter((c) => c.id !== clientId);
            return (
              <div className="sticky top-2 z-20 flex items-center gap-2 flex-wrap bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 shadow-sm mb-4">
                <button onClick={() => setSelectedIds(allVisibleSelected ? new Set() : new Set(acts0.map((a) => a.id)))}
                  className="text-xs font-medium text-violet-700 border border-violet-300 bg-white rounded-full px-3 py-1.5 hover:bg-violet-100 transition-colors">
                  {allVisibleSelected ? "取消全選" : "全選"}
                </button>
                <span className="text-xs text-violet-700 font-medium">已選 {selectedIds.size} 項</span>
                <div className="flex-1" />
                {otherClients.length > 0 && (
                  <select disabled={batchBusy || selectedIds.size === 0} defaultValue=""
                    onChange={(e) => { const v = e.target.value; if (!v) return; runBatchMove(v); e.currentTarget.value = ""; }}
                    title="將選取嘅活動移到另一個品牌"
                    className="flex items-center gap-1 text-xs bg-white border border-violet-300 text-violet-700 rounded-full px-3 py-1.5 outline-none cursor-pointer disabled:opacity-50">
                    <option value="">移到品牌…</option>
                    {otherClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                <button disabled={batchBusy || selectedIds.size === 0}
                  onClick={() => { if (confirmBatchDelete) runBatchDelete(); else { setConfirmBatchDelete(true); setTimeout(() => setConfirmBatchDelete(false), 3000); } }}
                  className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-colors disabled:opacity-50
                    ${confirmBatchDelete ? "bg-red-500 text-white border-red-500" : "bg-white text-red-600 border-red-300 hover:bg-red-50"}`}>
                  <Trash2 className="h-3 w-3" />{confirmBatchDelete ? `確認刪除 ${selectedIds.size} 項？` : "刪除選取"}
                </button>
                <button onClick={exitSelect}
                  className="flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-300 bg-white rounded-full px-3 py-1.5 hover:bg-gray-100 transition-colors">
                  <X className="h-3 w-3" />完成
                </button>
              </div>
            );
          })()}
          {!selectMode && client.activities.length > 0 && (
            <p className="text-[11px] text-gray-400 mb-2">提示：長按任何活動即可進入多選，批次移到品牌 / 刪除。</p>
          )}
          {(() => {
            const acts = client.activities.filter((a) =>
              (actStatus === "ALL" || a.status === actStatus) &&
              (!actSearch.trim() || `${a.theme} ${a.focusPoint}`.toLowerCase().includes(actSearch.toLowerCase())));
            if (acts.length === 0) return <div className="text-center py-16 text-gray-400 text-sm">搵唔到符合條件嘅活動</div>;
            return (
              <div className="space-y-2.5">
                {acts.map((act) => (
                  <ActivityRow
                    key={act.id}
                    act={act}
                    selectMode={selectMode}
                    selected={selectedIds.has(act.id)}
                    deletingId={deletingId}
                    onOpen={() => router.push(`/clients/${clientId}/activities/${act.id}`)}
                    onToggleSelect={() => toggleSelect(act.id)}
                    onLongPress={() => { setSelectMode(true); setSelectedIds((prev) => new Set(prev).add(act.id)); }}
                    onDelete={(e) => handleDelete(e, act.id)}
                  />
                ))}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
