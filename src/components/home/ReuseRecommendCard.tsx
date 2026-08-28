import { RefreshCw } from "lucide-react";

export type ReuseRecommendItem = { thumb?: string; title: string; hint: string };

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
        <div className="text-xs text-gray-400">上傳素材後，這裡會推薦可再利用的圖</div>
      ) : (
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-13 w-13 shrink-0 overflow-hidden rounded-lg bg-gray-100" style={{ height: 52, width: 52 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.thumb && <img src={it.thumb} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm text-gray-800">{it.title}</div>
                <div className="truncate text-xs text-gray-400">{it.hint}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
