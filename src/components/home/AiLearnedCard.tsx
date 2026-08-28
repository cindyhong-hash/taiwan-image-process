import { Sparkles } from "lucide-react";

export function AiLearnedCard({ assetCount, percent }: { assetCount: number; percent: number }) {
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
        <div className="pt-1 text-xs text-gray-400">繼續上傳素材提升 AI 生成品質</div>
      </div>
    </div>
  );
}
