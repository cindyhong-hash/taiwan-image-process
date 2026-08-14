"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Sparkles, ImagePlus, ChevronDown } from "lucide-react";
import { BrandWorkspaceHeader } from "@/components/layout/BrandWorkspaceHeader";
import { LibraryWorkspace, type LibraryWorkspaceHandle } from "@/components/library/LibraryWorkspace";

export default function BrandComponentsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);  // [UX] 合併「＋ 新增素材」下拉
  const libRef = useRef<LibraryWorkspaceHandle>(null);

  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
  }, [params]);

  if (!clientId) return <div className="text-gray-400">載入中...</div>;

  return (
    <div>
      <BrandWorkspaceHeader
        clientId={clientId}
        activeTab="components"
        actions={
          /* [UX] 兩顆語意重疊的新增鈕合併成一顆「＋ 新增素材」下拉，清楚分「AI 生成」與「上傳分析」 */
          <div className="relative" onKeyDown={(e) => { if (e.key === "Escape") setMenuOpen(false); }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-1.5 text-xs font-medium bg-violet-600 text-white px-3 py-2 rounded-lg hover:bg-violet-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />新增素材
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div role="menu" className="absolute right-0 mt-1.5 z-50 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); libRef.current?.openAddPicker(); }}
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-violet-50/60 transition-colors"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-gray-800">AI 生成素材圖</span>
                      <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">產品合成・背景・人像・插畫</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); libRef.current?.openQuickAdd(); }}
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-violet-50/60 transition-colors"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                      <ImagePlus className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-gray-800">上傳圖片・存風格積木</span>
                      <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">上傳一張圖，AI 分析成 構圖・配色・背景</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        }
      />
      <LibraryWorkspace ref={libRef} clientId={clientId} />
    </div>
  );
}
