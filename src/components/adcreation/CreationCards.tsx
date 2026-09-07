import { Image as ImageIcon, ArrowRight, Check } from "lucide-react";
import { FreeLayoutIcon } from "@/components/icons/FreeLayoutIcon";

// 三張創作卡：整張卡可點＋hover 有反應（跟首頁 QuickStartCards 一致），
// 內層 CTA 只作視覺提示（pointer-events-none），實際點擊交給整張卡。
// 版面＝左側文字（約 45%）＋右側示意圖（約 55%，透明 PNG、object-contain 不裁切、不加白底）。
export function CreationCards({
  onNewGenerate,
  onApplyBase,
  onFreeLayout,
}: {
  onNewGenerate: () => void;
  onApplyBase: () => void;
  onFreeLayout: () => void;
}) {
  const cardBase =
    "group relative grid grid-cols-[42fr_58fr] items-stretch gap-3 overflow-hidden rounded-2xl border p-5 text-left transition-all cursor-pointer";
  const leftCol = "flex min-w-0 flex-col";
  const rightCol = "flex min-w-0 items-center justify-center";
  const img = "h-full max-h-72 w-full object-contain";
  const cta =
    "pointer-events-none mt-auto inline-flex self-start items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium";
  const feat = "flex items-center gap-1.5 text-xs text-gray-500";
  const check = "h-3.5 w-3.5 shrink-0 text-violet-500";

  return (
    <div className="mb-8 grid grid-cols-3 gap-4">
      {/* 卡1 全新生成 → 生成類型 popup（淡紫底） */}
      <button
        type="button"
        onClick={onNewGenerate}
        className={`${cardBase} border-[#ebe4f9] bg-[#f9f6ff] hover:border-violet-300 hover:shadow-md`}
      >
        <div className={leftCol}>
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold text-white">AI</span>
          <div className="text-lg font-semibold text-gray-900">AI 全新生成</div>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">告訴 AI 你想做什麼，直接產生完整圖文。</p>
          <ul className="mt-3 mb-5 space-y-1.5">
            <li className={feat}><Check className={check} />輸入主題或需求</li>
            <li className={feat}><Check className={check} />AI 生成圖文素材</li>
            <li className={feat}><Check className={check} />支援單圖 / 多圖</li>
          </ul>
          <span className={`${cta} bg-violet-600 text-white`}>開始生成 <ArrowRight className="h-4 w-4" /></span>
        </div>
        <div className={rightCol}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/creation/ai.png" alt="AI 全新生成示意" loading="lazy" className={img} />
        </div>
      </button>

      {/* 卡2 使用現有素材 → 從素材庫揀底圖（淡藍底） */}
      <button
        type="button"
        onClick={onApplyBase}
        className={`${cardBase} border-[#e2ecfb] bg-[#f3f8ff] hover:border-violet-300 hover:shadow-md`}
      >
        <div className={leftCol}>
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-500"><ImageIcon className="h-5 w-5" /></span>
          <div className="text-lg font-semibold text-gray-900">使用現有素材</div>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">選擇素材庫中的圖片，快速套用文字與內容。</p>
          <ul className="mt-3 mb-5 space-y-1.5">
            <li className={feat}><Check className={check} />從素材庫選擇圖片</li>
            <li className={feat}><Check className={check} />套用文字與版型</li>
            <li className={feat}><Check className={check} />快速產出專業圖文</li>
          </ul>
          <span className={`${cta} border border-[#ebeff5] bg-white text-gray-600 group-hover:border-violet-300 group-hover:text-violet-600`}>選擇素材 <ArrowRight className="h-4 w-4" /></span>
        </div>
        <div className={rightCol}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/creation/material.png" alt="使用現有素材示意" loading="lazy" className={img} />
        </div>
      </button>

      {/* 卡3 自由設計 → 建立精靈（空白/從素材/AI底圖 → 選尺寸 → Magic Layers 編輯器）（淡粉／杏底） */}
      <button
        type="button"
        onClick={onFreeLayout}
        className={`${cardBase} border-[#fbe4ea] bg-[#fff5f7] hover:border-violet-300 hover:shadow-md`}
      >
        <div className={leftCol}>
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-pink-100 text-pink-500"><FreeLayoutIcon className="h-5 w-5" /></span>
          <div className="text-lg font-semibold text-gray-900">自由設計</div>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">自由加入圖片、文字與素材，打造專屬設計。</p>
          <ul className="mt-3 mb-5 space-y-1.5">
            <li className={feat}><Check className={check} />自由拖曳排版</li>
            <li className={feat}><Check className={check} />加入文字、貼圖、素材</li>
            <li className={feat}><Check className={check} />自由調整版面</li>
          </ul>
          <span className={`${cta} border border-[#ebeff5] bg-white text-gray-600 group-hover:border-violet-300 group-hover:text-violet-600`}>開啟編輯器 <ArrowRight className="h-4 w-4" /></span>
        </div>
        <div className={rightCol}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/creation/freelayout.png" alt="自由設計示意" loading="lazy" className={img} />
        </div>
      </button>
    </div>
  );
}
