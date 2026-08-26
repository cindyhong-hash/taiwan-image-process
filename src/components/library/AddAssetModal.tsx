"use client";
/**
 * AddAssetModal — 「新增產品／素材圖片」入口第一步（type-picker）。
 * 先揀 4 類型 → 上層 router.push 去全頁 /clients/[clientId]/components/new?type=xxx：
 *   • 產品圖 → PromptComposer；背景/人像/2D插圖 → GenerateAssetForm。
 * 落咗嗰頁之後想轉類型，用返頁面右上「已選類型」切換器（一樣係呢個 modal），
 * 唔使返嚟第一步。
 */
import { X, ImageIcon, Mountain, UserRound, Palette } from "lucide-react";

export type AddAssetType = "product" | "background" | "person" | "illustration";

const TYPES: { key: AddAssetType; label: string; sub: string; icon: React.ReactNode }[] = [
  { key: "product", label: "產品圖", sub: "上傳產品主圖合成 · FLUX.2 edit", icon: <ImageIcon className="h-6 w-6" /> },
  { key: "background", label: "背景", sub: "純背景底圖 · FLUX.1", icon: <Mountain className="h-6 w-6" /> },
  { key: "person", label: "人像", sub: "真人寫實 · FLUX.2 pro", icon: <UserRound className="h-6 w-6" /> },
  { key: "illustration", label: "2D 插圖", sub: "2D 插畫 · Recraft V3", icon: <Palette className="h-6 w-6" /> },
];

export function AddAssetModal({
  onPick,
  onClose,
}: {
  onPick: (type: AddAssetType) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">新增產品／素材圖片</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 rounded-full p-1 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-5">先選類型，表單會跟著變（引擎依類型自動切換）。</p>

        <div className="grid grid-cols-2 gap-3">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => onPick(t.key)}
              className="flex flex-col items-center text-center gap-2 border border-gray-200 rounded-xl p-4 hover:border-violet-400 hover:bg-violet-50/40 transition-colors"
            >
              <span className="text-violet-600">{t.icon}</span>
              <span className="text-sm font-medium text-gray-800">{t.label}</span>
              <span className="text-[11px] text-gray-400 leading-tight">{t.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
