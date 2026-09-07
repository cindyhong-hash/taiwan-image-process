import { Sparkles } from "lucide-react";

export function AdCreationHeader() {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-500">
        <Sparkles className="h-6 w-6" />
      </span>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">開始創作</h1>
        <p className="mt-1 text-sm text-gray-500">選擇適合你的方式，快速完成品牌圖文</p>
      </div>
    </div>
  );
}
