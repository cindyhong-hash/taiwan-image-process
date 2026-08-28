import { Sparkles, Image as ImageIcon, LayoutTemplate, ArrowRight } from "lucide-react";

export function CreationCards({ onNewGenerate }: { onNewGenerate: () => void }) {
  return (
    <div className="mb-8 grid grid-cols-3 gap-4">
      {/* 卡1 全新生成（推薦，violet 虛線框）— 本 Phase 接 popup */}
      <div className="relative rounded-2xl border-2 border-dashed border-violet-300 bg-white p-5">
        <span className="absolute right-4 top-4 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-600">推薦</span>
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold text-white">AI</span>
        <div className="text-lg font-semibold text-gray-900">全新生成</div>
        <p className="mt-1 mb-5 text-sm text-gray-400">描述需求、貼上參考，AI 會為你全新生成專屬素材</p>
        <button type="button" onClick={onNewGenerate} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
          開始創作 <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {/* 卡2 套用素材底圖 — 本 Phase 視覺卡，onClick 留白 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-500"><ImageIcon className="h-5 w-5" /></span>
        <div className="text-lg font-semibold text-gray-900">套用素材底圖</div>
        <p className="mt-1 mb-5 text-sm text-gray-400">選擇專業的造型與素材，快速套用內容</p>
        <button type="button" className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          選擇底圖 <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {/* 卡3 自由排版（NEW）— 本 Phase 視覺卡，onClick 留白 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-start justify-between">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-500"><LayoutTemplate className="h-5 w-5" /></span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-600">NEW</span>
        </div>
        <div className="text-lg font-semibold text-gray-900">自由排版</div>
        <p className="mt-1 mb-5 text-sm text-gray-400">選擇專業的底圖與素材，自由移動，打造專屬設計</p>
        <button type="button" className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          開始創作 <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
