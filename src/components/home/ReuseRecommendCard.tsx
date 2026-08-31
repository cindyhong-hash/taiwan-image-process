import { RefreshCw, ArrowRight } from "lucide-react";

export type ReuseRecommendItem = {
  thumb?: string;
  title: string;
  hint: string;            // 這張適合拿來做什麼（依素材類型偵測）
  actionLabel?: string;    // 一鍵接下一步的動作名（如「做排版底圖」「帶入生成」）
  onClick?: () => void;
};

export function ReuseRecommendCard({ items }: { items: ReuseRecommendItem[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
          <RefreshCw className="h-4 w-4 text-violet-600" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900">素材再利用推薦</h3>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-400">上傳或生成素材後，這裡會推薦可再利用的圖</div>
      ) : (
        <div className="space-y-1">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={it.onClick}
              className="group flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-violet-50/60"
            >
              <div className="shrink-0 overflow-hidden rounded-lg bg-gray-100" style={{ height: 52, width: 52 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.thumb && <img src={it.thumb} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-gray-800">{it.title}</div>
                <div className="truncate text-xs text-gray-400">{it.hint}</div>
              </div>
              {it.actionLabel && (
                <span className="shrink-0 flex items-center gap-0.5 text-[11px] font-medium text-violet-600 opacity-0 transition-opacity group-hover:opacity-100">
                  {it.actionLabel}<ArrowRight className="h-3 w-3" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
