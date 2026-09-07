"use client";
/**
 * 頂部大型 AI 輸入框（第四節）+ 快速 Filter Chips。
 * 使用者可留空直接看推薦，或輸入方向/產品/族群/節日/主題。
 */
import { Sparkles, Search } from "lucide-react";

const CHIPS = ["熱門話題", "季節時事", "節日行銷", "產品應用", "知識教育", "生活風格", "互動話題"];

export function InspirationSearchBar({
  value,
  onChange,
  onSubmit,
  activeChip,
  onChip,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  activeChip: string;
  onChip: (chip: string) => void;
  loading: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 rounded-2xl border border-violet-200 bg-white p-2 pl-4 shadow-sm focus-within:border-violet-400">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          placeholder="告訴我們想找什麼靈感…（換季保養、學生族、除毛知識、節慶行銷）"
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> 找靈感
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const active = activeChip === chip;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => onChip(chip)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-violet-300 bg-violet-100 text-violet-700"
                  : "border-gray-200 bg-white text-gray-500 hover:border-violet-200 hover:text-violet-600"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>
    </div>
  );
}
