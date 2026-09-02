"use client";
import { useState } from "react";
import { Search, Sparkles } from "lucide-react";

// 網站搜尋：搜現有活動 + 素材（標題 / 內文 / Prompt）。chips = 快速搜尋範例詞。
const CHIPS = ["貼文", "產品圖", "背景", "海報"];

export function HomeHero({ query, onSearch }: { query: string; onSearch: (q: string) => void }) {
  const [q, setQ] = useState(query);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
          今天，想<span className="text-violet-600">創作</span>什麼？
          <Sparkles className="h-6 w-6 text-violet-500" />
        </h1>
        <p className="mt-2 text-sm text-gray-400">描述需求、貼上參考，AI 會依照品牌記憶自動生成素材</p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 pl-4 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSearch(q.trim()); }}
          placeholder="搜尋活動、素材…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
        {q && (
          <button type="button" onClick={() => { setQ(""); onSearch(""); }} className="shrink-0 text-xs text-gray-400 hover:text-gray-600 px-1">清除</button>
        )}
        <button type="button" onClick={() => onSearch(q.trim())} className="shrink-0 rounded-xl bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">搜尋</button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400">試試：</span>
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { setQ(c); onSearch(c); }}
            className="rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-colors"
          >
            {c}
          </button>
        ))}
      </div>
    </section>
  );
}
