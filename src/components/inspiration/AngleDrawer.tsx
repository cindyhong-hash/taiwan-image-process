"use client";
/**
 * 切角抽屜（第九節）：點「看看 AI 怎麼切入」開啟，列出一個 Topic 的 4–5 個切角，
 * 每個可直接「用這個做貼文」，不必先進完整 Brief。右側 sheet 樣式對齊既有 BatchDrawer。
 */
import { useEffect, useState } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";
import type { ContentAngle, Opportunity } from "@/lib/inspiration/types";

export function AngleDrawer({
  clientId,
  opp,
  onClose,
  onUseAngle,
}: {
  clientId: string;
  opp: Opportunity;
  onClose: () => void;
  onUseAngle: (opp: Opportunity, angle: ContentAngle) => void;
}) {
  const [angles, setAngles] = useState<ContentAngle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開抽屜時抓切角，進入 loading 狀態（合法）
    setLoading(true);
    setError(false);
    fetch("/api/inspiration/angles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, topic: opp.title }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setAngles(Array.isArray(d.angles) ? d.angles : []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [clientId, opp.title]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-gray-950/25 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-violet-500">AI 切角建議</p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-gray-900">{opp.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="ml-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> AI 正在想切角…
            </div>
          )}
          {error && !loading && (
            <div className="py-16 text-center text-sm text-gray-400">
              產生切角失敗，請關掉重試。
            </div>
          )}
          {!loading &&
            !error &&
            angles.map((a, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-3.5 transition-shadow hover:shadow-sm">
                <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-600">
                  {a.type}
                </span>
                <p className="mt-2 text-sm font-medium leading-snug text-gray-900">{a.title}</p>
                {a.copyDirection && <p className="mt-1 text-xs leading-relaxed text-gray-500">{a.copyDirection}</p>}
                <button
                  type="button"
                  onClick={() => onUseAngle(opp, a)}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
                >
                  <Sparkles className="h-3.5 w-3.5" /> 用這個做貼文
                </button>
              </div>
            ))}
          {!loading && !error && angles.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-400">目前沒有切角建議。</div>
          )}
        </div>
      </div>
    </div>
  );
}
