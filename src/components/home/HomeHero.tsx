"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
const CHIPS = ["貼文", "情境圖", "圖片去背", "品牌形象海報"];
export function HomeHero() {
  const [q, setQ] = useState("");
  return (
    <section className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
          今天，想做什麼 <span className="text-violet-600">素材</span>呢？
          <Sparkles className="h-6 w-6 text-violet-500" />
        </h1>
        <p className="mt-2 text-sm text-gray-400">描述需求、貼上參考，AI 會依照品牌記憶自動生成素材</p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 pl-4 shadow-sm">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="想找什麼？"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" />
        <button type="button" className="shrink-0 rounded-xl bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700">搜尋 ✨</button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400">試試：</span>
        {CHIPS.map(c => (
          <span key={c} className="rounded-full border border-gray-200 px-3 py-1 text-gray-600">{c}</span>
        ))}
      </div>
    </section>
  );
}
