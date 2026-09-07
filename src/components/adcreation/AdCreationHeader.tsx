import { Sparkles } from "lucide-react";

export function AdCreationHeader() {
  return (
    <div className="mb-6 flex items-center gap-3">
      <Sparkles className="h-8 w-8 shrink-0 text-violet-500" />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">開始創作</h1>
        <p className="mt-1 text-sm text-gray-500">選擇適合你的方式，快速完成品牌圖文</p>
      </div>
    </div>
  );
}
