"use client";
/**
 * BrandWorkspaceHeader — wireframe v2 ③⑤⑥ 統一品牌工作區 header。
 * 右邊內容區頂部一致：switch-tab [廣告活動圖 | 風格組件]（左）+ 品牌設定（右上）。
 * 用喺 /clients/[clientId]（廣告活動圖）同 /clients/[clientId]/components（風格組件）兩個 tab 頁。
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Target, Layers, Settings, Plus, FolderOpen } from "lucide-react";

type Tab = "activities" | "components";

export function BrandWorkspaceHeader({
  clientId,
  activeTab,
  actions,
  name: nameProp,
}: {
  clientId: string;
  activeTab: Tab;
  actions?: React.ReactNode;
  /** Parent 已 load client 時直接傳入 → 品牌名/icon 同頁面一齊出，唔使等第二個 fetch（IMG_01）。
   *  未傳就 fallback 自己 fetch（保持未改的 caller 行為）。 */
  name?: string;
}) {
  const [fetched, setFetched] = useState<string>("");
  const name = nameProp ?? fetched;

  useEffect(() => {
    if (nameProp !== undefined || !clientId) return; // 有 prop 就唔再 fetch
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((c) => setFetched(c?.name ?? ""))
      .catch(() => {});
  }, [clientId, nameProp]);

  const tabs: { key: Tab; label: string; href: string; icon: React.ReactNode }[] = [
    { key: "activities", label: "廣告活動圖", href: `/clients/${clientId}`, icon: <Target className="h-4 w-4" /> },
    { key: "components", label: "素材庫", href: `/clients/${clientId}/components`, icon: <Layers className="h-4 w-4" /> },
  ];

  return (
    <div className="mb-6">
      {/* tab bar + actions */}
      <div className="flex items-center justify-between gap-4 border-b">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={`flex items-center gap-1.5 px-4 pb-3 pt-1 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.key
                  ? "border-black text-black"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {t.icon}
              {t.label}
            </Link>
          ))}
        </div>
        {/* 按鈕 style 同「風格組件」tab（素材生成/上傳參考圖）一致：text-xs · px-3 py-2 · rounded-lg */}
        <div className="flex items-center gap-2 pb-2">
          <Link
            href={`/clients/${clientId}/settings`}
            className="flex items-center gap-1.5 text-xs font-medium border border-gray-300 text-gray-700 bg-white px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />品牌設定
          </Link>
          {activeTab === "activities" && (
            <Link
              href={`/clients/${clientId}/activities/new`}
              className="flex items-center gap-1.5 text-xs font-medium bg-violet-600 text-white px-3 py-2 rounded-lg hover:bg-violet-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />新增活動
            </Link>
          )}
          {/* tab 專屬動作掣（素材庫：上傳參考圖 / 新增產品素材圖片）由 page 傳入 */}
          {actions}
        </div>
      </div>

      {/* brand title — folder icon 同側欄一致用灰色 */}
      {name && (
        <div className="flex items-center gap-2 mt-4">
          <FolderOpen className="h-5 w-5 text-gray-500" />
          <h1 className="text-xl font-semibold">{name}</h1>
        </div>
      )}
    </div>
  );
}
