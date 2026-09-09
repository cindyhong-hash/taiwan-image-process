"use client";
import { useState } from "react";
import { History, RotateCw, ImageOff } from "lucide-react";

export type PastActivityItem = {
  thumb?: string;
  title: string;
  dateStr: string;
  /** 為什麼現在推薦翻新這一篇（去年同期／檔期又到／最近較少這類內容…）。 */
  reason?: string;
  onReuse: () => void;
};

// 內容再利用機會 → 再次使用（複製舊活動設定 → 新草稿，並標記需更新內容）。
// 挑選規則見 src/lib/home/reuse-picker.ts（時間／季節性／產品相關性／內容缺口／
// 主題時效／重複程度），刻意不是「最新的三篇」——那跟下方「最近作品」重複。
export function PastActivityCard({ items }: { items: PastActivityItem[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
          <History className="h-4 w-4 text-violet-600" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900">內容再利用機會</h3>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-400">完成一段時間的活動後，這裡會挑出現在最值得翻新的舊內容</div>
      ) : (
        <div className="space-y-1">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={it.onReuse}
              className="group flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-violet-50/60"
            >
              <Thumb src={it.thumb} />
              <div className="min-w-0 flex-1">
                {/* 標題允許兩行：這張卡在窄的右欄，單行 truncate 會變成「我的飛…」
                    完全看不出是哪一篇。 */}
                <div className="line-clamp-2 text-sm leading-snug text-gray-800" title={it.title}>{it.title}</div>
                <div className="mt-0.5 flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-400">{it.reason ?? it.dateStr}</span>
                  {/* 只放 icon，不放「再次使用」四個字：那顆 label 就算 hover 才顯示，
                      版面寬度一直被它佔著，是標題被壓扁的主因。整列本來就可點。 */}
                  <RotateCw className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-colors group-hover:text-violet-600" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 縮圖：載不到就顯示佔位，不要留破圖 icon。
 *  舊活動的成品圖有可能已經不存在（例如早期存在 /uploads/ 的檔案），
 *  而這張卡刻意挑「比較舊」的內容，撞到的機率比別處高。 */
function Thumb({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100" style={{ height: 52, width: 52 }}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <ImageOff className="h-4 w-4 text-gray-300" />
      )}
    </div>
  );
}
