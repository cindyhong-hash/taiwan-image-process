import { Sparkles } from "lucide-react";

/** 「AI 已學習」：啞元件，數字由呼叫端用 brandCompleteness() 算好傳進來。
 *  兩個呼叫端（首頁／品牌設定頁）必須共用同一支函式，
 *  否則同一張卡在兩頁會顯示不同的百分比。 */
export function AiLearnedCard({
  assetCount,
  percent,
  missing = [],
}: {
  assetCount: number;
  percent: number;
  /** 還沒填的項目。只給百分比使用者不知道要做什麼才能提高，列出來才有行動性。 */
  missing?: string[];
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
          <Sparkles className="h-3.5 w-3.5 text-violet-600" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900">AI 已學習</h3>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">品牌素材</span>
          <span className="font-medium text-violet-600">{assetCount} 張</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">品牌設定完成度</span>
          <span className="font-medium text-violet-600">{percent}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-violet-500" style={{ width: `${percent}%` }} />
        </div>
        {missing.length > 0 ? (
          <div className="pt-1 text-xs leading-relaxed text-gray-400">
            還缺：<span className="text-gray-600">{missing.join("、")}</span>
          </div>
        ) : (
          <div className="pt-1 text-xs text-gray-400">品牌設定已完整，AI 會依這些規範生成</div>
        )}
      </div>
    </div>
  );
}
