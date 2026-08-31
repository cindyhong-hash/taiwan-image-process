"use client";
/**
 * RolePickerModal — 揀一張素材圖之後，決定佢喺活動圖生成裡面嘅角色。
 * 三邊共用（Mode A② 用素材庫圖片 / Mode B 素材庫圖片 pop-up「帶入活動圖生成」）→ 行為一致。
 *   ① 作參考圖  → 借風格，AI 另生成新畫面（塞入 referenceImageUrls，行現有流程）
 *   ② 作活動圖底圖 → 成張相 100% 做背景、唔重新生圖，之後喺圖上生成文字（後續文字排版階段）
 */
import { Target, ImageDown, X } from "lucide-react";

export type ActivityImageRole = "reference" | "base";

// 帶入活動圖生成時，圖經 sessionStorage 傳去新增活動頁（唔喺網址外露）。三邊共用。
export const ACTIVITY_REF_KEY = "activityRefImage";
export const ACTIVITY_BASE_KEY = "activityBaseImage";
export const ACTIVITY_IMAGE_PROMPT_KEY = "activityImagePrompt"; // 帶入圖嘅 AI prompt → 預填畫面描述
// [UX] 單圖↔多圖切版型時，共用欄位的交接：JSON {imagePrompt, requiredText, productImageUrls}
// 切版型前寫入、到另一頁 init 時讀入並清掉，令使用者唔會因為換版型而要重打。
export const ACTIVITY_HANDOFF_KEY = "activityFormHandoff";
// [Magic Layers] 素材庫「用這張做背景排版」→ 經 sessionStorage 傳圖 URL 去 /magic-layers/compose。
export const ML_COMPOSE_BG_KEY = "mlComposeBg";
// 同時帶 clientId，令 compose 頁的背景庫連動「該品牌素材庫」的內容。
export const ML_COMPOSE_CLIENT_KEY = "mlComposeClient";
// [自由排版精靈] compose() 完成後把 {layers, docW, docH, clientId, title, subtitle} 經
// sessionStorage 傳去 /magic-layers/compose?seed=1，畫面一開即直接落地編輯器（跳過表單）。
export const ML_WIZARD_SEED_KEY = "mlWizardSeed";

export function RolePickerModal({
  imageUrl,
  onPick,
  onClose,
}: {
  imageUrl: string;
  onPick: (role: ActivityImageRole) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="text-sm font-semibold">帶入活動圖生成</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 揀咗嘅圖預覽 */}
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="已選的素材圖" className="max-h-40 rounded-xl border object-contain bg-gray-50" />
          </div>

          <p className="text-xs text-gray-500 text-center">呢張圖要點用？</p>

          <div className="grid grid-cols-1 gap-2.5">
            {/* ① 參考圖 */}
            <button type="button" onClick={() => onPick("reference")}
              className="flex items-start gap-3 text-left rounded-xl border border-gray-200 p-3.5 hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <Target className="h-4.5 w-4.5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-800">① 作參考圖</span>
                <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">借這張圖的風格，AI 另外生成一張全新畫面。</span>
              </span>
            </button>

            {/* ② 活動圖底圖 */}
            <button type="button" onClick={() => onPick("base")}
              className="flex items-start gap-3 text-left rounded-xl border border-gray-200 p-3.5 hover:border-violet-400 hover:bg-violet-50/40 transition-colors">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                <ImageDown className="h-4.5 w-4.5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-800">② 作活動圖底圖</span>
                <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">整張圖 100% 做背景（不重新生圖），之後在圖上加文字。</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
