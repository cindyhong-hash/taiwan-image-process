"use client";
/**
 * 「為你推薦的靈感」卡（第七節）。Image Preview + Tag + Title + Description + Recommended Product +
 * Format Suggestion + Action（✨ 用這個做貼文）。
 */
import { useState } from "react";
import { Sparkles, LayoutGrid, Square, Loader2 } from "lucide-react";
import { TAG_META, type Recommendation } from "@/lib/inspiration/types";

export function RecommendationCard({
  rec,
  onUsePost,
  busy = false,
}: {
  rec: Recommendation;
  onUsePost: (rec: Recommendation) => void;
  /** 只有「這一張」正在生成畫面描述時才為 true。其他卡片完全不受影響。 */
  busy?: boolean;
}) {
  const tag = TAG_META[rec.tag];
  const [imgError, setImgError] = useState(false);
  // 張數優先於 format：AI 現在會直接給 1–5，format 只是舊欄位。
  const multi = (rec.suggestedCount ?? (rec.suggestedFormat === "carousel" ? 2 : 1)) > 1;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Image preview（重用既有素材圖；沒有就 pastel 佔位）
          圖必須「絕對定位填滿」，不能只給 h-full：容器高度是靠 aspect-ratio 撐出來的，
          正常流的圖用 h-full 解不出百分比高度會退回 auto，改用自己的比例把容器撐開
          —— 產品套圖是 4096×4096，會把 4:3 的框硬撐成正方形，整排卡片高度就跑掉。 */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-violet-50 to-fuchsia-50">
        {rec.imageUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rec.imageUrl} alt={rec.title} className="absolute inset-0 h-full w-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Sparkles className="h-7 w-7 text-violet-200" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-gray-600 backdrop-blur">
          {tag.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="text-sm font-semibold leading-snug text-gray-900">{rec.title}</h3>
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-gray-500">{rec.description}</p>

        {rec.recommendedProduct && (
          <p className="mt-2.5 text-[11px] text-gray-500">
            推薦帶入：<span className="font-medium text-gray-700">{rec.recommendedProduct.label}</span>
          </p>
        )}

        {/* 明講會開幾張：點下去可能直接進多圖流程，先講清楚比較不會被嚇到。 */}
        <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-400">
          {multi ? <LayoutGrid className="h-3 w-3" /> : <Square className="h-3 w-3" />}
          {multi ? `建議：${rec.suggestedCount ?? 2} 張輪播` : "建議：單圖"}
        </div>

        <div className="mt-auto pt-3.5">
          <button
            type="button"
            onClick={() => onUsePost(rec)}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {busy ? "準備中…" : "用這個做貼文"}
          </button>
        </div>
      </div>
    </div>
  );
}
