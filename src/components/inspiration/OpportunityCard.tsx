"use client";
/**
 * 內容機會卡（第六節）。四型共用：正在升溫 / 近期值得準備 / 你可以重新利用 / 品牌內容缺口。
 * 重點順序：Type → Title → Why Now → Recommended Product → Suggested Angle → CTA。
 */
import { useState } from "react";
import { TrendingUp, CalendarClock, RefreshCw, PieChart, Sparkles, ArrowRight } from "lucide-react";
import { OPPORTUNITY_META, type Opportunity, type OpportunityType } from "@/lib/inspiration/types";

const TYPE_ICON: Record<OpportunityType, typeof TrendingUp> = {
  trend: TrendingUp,
  upcoming: CalendarClock,
  reuse: RefreshCw,
  gap: PieChart,
};

export function OpportunityCard({
  opp,
  onUsePost,
  onOpenAngles,
  onReuse,
}: {
  opp: Opportunity;
  onUsePost: (opp: Opportunity) => void;
  onOpenAngles: (opp: Opportunity) => void;
  onReuse: (activityId: string) => void;
}) {
  const meta = OPPORTUNITY_META[opp.type];
  const Icon = TYPE_ICON[opp.type];
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}>
        <Icon className="h-3 w-3" />
        {meta.label}
      </span>

      <h3 className="mt-2.5 text-[15px] font-semibold leading-snug text-gray-900">{opp.title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{opp.whyNow}</p>

      {typeof opp.brandFit === "number" && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>品牌適配度</span>
            <span className="font-medium text-violet-600">{opp.brandFit}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-violet-400" style={{ width: `${opp.brandFit}%` }} />
          </div>
        </div>
      )}

      {opp.reuseNote && <p className="mt-3 text-[11px] text-emerald-600">· {opp.reuseNote}</p>}
      {opp.gapNote && <p className="mt-3 text-[11px] text-violet-600">· {opp.gapNote}</p>}

      {opp.recommendedProduct && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 p-2">
          {opp.recommendedProduct.imageUrl && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={opp.recommendedProduct.imageUrl} alt={opp.recommendedProduct.label} className="h-8 w-8 rounded-md border border-gray-200 object-cover" onError={() => setImgError(true)} />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-100 text-[10px] text-violet-500">產品</span>
          )}
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400">推薦帶入</p>
            <p className="truncate text-xs font-medium text-gray-700">{opp.recommendedProduct.label}</p>
          </div>
        </div>
      )}

      {opp.suggestedAngle && (
        <p className="mt-3 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs italic leading-relaxed text-violet-700">
          「{opp.suggestedAngle}」
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {opp.type === "reuse" && opp.reuseActivityId ? (
          <button
            type="button"
            onClick={() => onReuse(opp.reuseActivityId!)}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
          >
            再次使用 <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onOpenAngles(opp)}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-50"
            >
              {opp.cta ?? "看看 AI 怎麼切入"} <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onUsePost(opp)}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
            >
              <Sparkles className="h-3.5 w-3.5" /> 用這個做貼文
            </button>
          </>
        )}
      </div>
    </div>
  );
}
