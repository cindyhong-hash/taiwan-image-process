"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, Search } from "lucide-react";
import { BrandWorkspaceHeader } from "@/components/layout/BrandWorkspaceHeader";
import { BrandMemoryCards } from "@/components/clients/BrandMemoryCards";

type Activity = { id: string; theme: string; focusPoint: string; status: string; createdAt: string };
type Client = {
  id: string; name: string; activities: Activity[];
  // 品牌記憶卡用（/api/clients/[id] 已一併返）
  primaryColor?: string; secondaryColor?: string | null; paletteColors?: unknown;
  toneLabels?: string[]; taboos?: string[];
};

// 狀態標籤：按狀態上色（補返 FAILED；唔好再用黑色 default badge）。
const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING:    { label: "待生成", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  GENERATING: { label: "生成中", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  DONE:       { label: "已完成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  FAILED:     { label: "生成失敗", cls: "bg-red-50 text-red-600 border-red-200" },
};

export default function ClientFolderPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const [client, setClient] = useState<Client | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // [WIP-only] our edit — 活動 list 搜尋 + 狀態篩選（同事 廣告活動圖 功能區客製，勿 merge 入公司 repo）
  const [actSearch, setActSearch] = useState("");
  const [actStatus, setActStatus] = useState<string>("ALL");

  useEffect(() => {
    params.then(({ clientId }) => {
      setClientId(clientId);
      fetch(`/api/clients/${clientId}`).then((r) => r.json()).then(setClient);
    });
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
          {(() => {
            const acts = client.activities.filter((a) =>
              (actStatus === "ALL" || a.status === actStatus) &&
              (!actSearch.trim() || `${a.theme} ${a.focusPoint}`.toLowerCase().includes(actSearch.toLowerCase())));
            if (acts.length === 0) return <div className="text-center py-16 text-gray-400 text-sm">搵唔到符合條件嘅活動</div>;
            return (
              <div className="space-y-2.5">
                {acts.map((act) => (
                  <Link key={act.id} href={`/clients/${clientId}/activities/${act.id}`} className="block">
                    <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all">
                      <div>
                        <div className="font-medium">{act.theme}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{act.focusPoint}</div>
                        <div className="text-xs text-gray-300 mt-0.5">
                          {new Date(act.createdAt).toLocaleDateString("zh-TW")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const s = STATUS_META[act.status] ?? { label: act.status || "—", cls: "bg-gray-100 text-gray-500 border-gray-200" };
                          return <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>;
                        })()}
                        <button
                          onClick={(e) => handleDelete(e, act.id)}
                          disabled={deletingId === act.id}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
