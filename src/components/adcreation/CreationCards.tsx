import Link from "next/link";
import { Image as ImageIcon, LayoutTemplate, ArrowRight } from "lucide-react";

// 三張創作卡：整張卡可點＋hover 有反應（跟首頁 QuickStartCards 一致），
// 內層 CTA 只作視覺提示（pointer-events-none），實際點擊交給整張卡。
export function CreationCards({
  onNewGenerate,
  onApplyBase,
  clientId,
}: {
  onNewGenerate: () => void;
  onApplyBase: () => void;
  clientId: string;
}) {
  const cardBase =
    "group relative flex flex-col rounded-2xl bg-white p-5 text-left transition-all cursor-pointer";
  const cta =
    "pointer-events-none flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium";
  return (
    <div className="mb-8 grid grid-cols-3 gap-4">
      {/* 卡1 全新生成（推薦，violet 虛線框）→ 生成類型 popup */}
      <button
        type="button"
        onClick={onNewGenerate}
        className={`${cardBase} border-2 border-dashed border-violet-300 hover:bg-violet-50/30 hover:shadow-md`}
      >
        <span className="absolute right-4 top-4 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-600">推薦</span>
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold text-white">AI</span>
        <div className="text-lg font-semibold text-gray-900">全新生成</div>
        <p className="mt-1 mb-5 text-sm text-gray-400">描述需求、貼上參考，AI 會為你全新生成專屬素材</p>
        <span className={`${cta} mt-auto bg-violet-600 text-white`}>
          開始創作 <ArrowRight className="h-4 w-4" />
        </span>
      </button>

      {/* 卡2 套用素材底圖 → 從素材庫揀底圖 */}
      <button
        type="button"
        onClick={onApplyBase}
        className={`${cardBase} border border-gray-200 hover:border-violet-300 hover:shadow-sm`}
      >
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-500"><ImageIcon className="h-5 w-5" /></span>
        <div className="text-lg font-semibold text-gray-900">套用素材底圖</div>
        <p className="mt-1 mb-5 text-sm text-gray-400">選擇專業的造型與素材，快速套用內容</p>
        <span className={`${cta} mt-auto border border-gray-200 text-gray-600 group-hover:border-violet-300 group-hover:text-violet-600`}>
          選擇底圖 <ArrowRight className="h-4 w-4" />
        </span>
      </button>

      {/* 卡3 自由排版（NEW）→ 空白 Magic Layers 畫布（同首頁） */}
      <Link
        href={`/magic-layers/compose?blank=1&clientId=${clientId}`}
        className={`${cardBase} border border-gray-200 hover:border-violet-300 hover:shadow-sm`}
      >
        <div className="mb-4 flex items-start justify-between">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-500"><LayoutTemplate className="h-5 w-5" /></span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-600">NEW</span>
        </div>
        <div className="text-lg font-semibold text-gray-900">自由排版</div>
        <p className="mt-1 mb-5 text-sm text-gray-400">選擇專業的底圖與素材，自由移動，打造專屬設計</p>
        <span className={`${cta} mt-auto border border-gray-200 text-gray-600 group-hover:border-violet-300 group-hover:text-violet-600`}>
          開始創作 <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    </div>
  );
}
