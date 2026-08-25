"use client";

import { useState } from "react";
import { Lightbulb, Loader2, RefreshCw } from "lucide-react";

/**
 * 「靈感」按鈕 + 浮層清單。
 * 點一下 → 依品牌設定產生選題（不用手打）→ 點選題即帶入目標欄位。
 * field="theme"：填入 title（多圖核心主題）；field="scene"：填入 desc（單圖畫面描述）。
 */

type Idea = { title: string; desc: string };

export function InspireButton({
  clientId,
  field,
  onPick,
  disabled,
}: {
  clientId: string;
  field: "theme" | "scene";
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchIdeas = async (avoid: string[] = []) => {
    if (!clientId) {
      setError("請先選擇品牌");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/inspire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, mode: field, avoid }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "取得靈感失敗");
        setIdeas([]);
      } else {
        setIdeas(data.ideas ?? []);
      }
    } catch {
      setError("取得靈感失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && ideas.length === 0 && !loading) fetchIdeas();
  };

  const pick = (idea: Idea) => {
    onPick(field === "theme" ? idea.title || idea.desc : idea.desc || idea.title);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
          disabled
            ? "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"
            : open
            ? "border-amber-300 text-amber-600 bg-amber-50"
            : "border-amber-300 text-amber-600 hover:bg-amber-50 cursor-pointer"
        }`}
      >
        <Lightbulb className="h-3 w-3" />
        靈感
      </button>

      {open && (
        <>
          {/* 點外面關閉 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-80 rounded-xl border border-gray-200 bg-white shadow-lg p-1.5">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Lightbulb className="h-3 w-3 text-amber-500" /> 選一個，直接帶入
              </span>
              <button
                type="button"
                onClick={() => fetchIdeas(ideas.map((i) => i.title).filter(Boolean))}
                disabled={loading}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-violet-600 disabled:opacity-40"
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                換一批
              </button>
            </div>

            {loading && ideas.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在依品牌想選題…
              </div>
            )}
            {error && (
              <div className="px-2 py-4 text-xs text-red-500 text-center">{error}</div>
            )}

            {ideas.length > 0 && (
              <div className="max-h-72 overflow-y-auto">
                {ideas.map((idea, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(idea)}
                    className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-violet-50 transition-colors group"
                  >
                    <div className="text-sm font-medium text-gray-800 group-hover:text-violet-700">
                      {idea.title || idea.desc}
                    </div>
                    {idea.title && idea.desc && (
                      <div className="text-xs text-gray-400 mt-0.5 leading-snug">
                        {idea.desc}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
