"use client";
/**
 * 內容機會卡（第六節）。四型共用：正在升溫 / 近期值得準備 / 你可以重新利用 / 品牌內容缺口。
 * 重點順序：Type → Title → Why Now → Suggested Angle → CTA。
 */
import { TrendingUp, CalendarClock, RefreshCw, PieChart, Sparkles, ArrowRight, Quote, Radar, Loader2 } from "lucide-react";
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
  busy = false,
  disabled = false,
}: {
  opp: Opportunity;
  onUsePost: (opp: Opportunity) => void;
  onOpenAngles: (opp: Opportunity) => void;
  onReuse: (activityId: string) => void;
  /** 這一張正在生成畫面描述（顯示轉圈）。 */
  busy?: boolean;
  /** 有「某一張」正在生成（其他張只鎖住，不要跟著轉）。 */
  disabled?: boolean;
}) {
  const meta = OPPORTUNITY_META[opp.type];
  const Icon = TYPE_ICON[opp.type];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Header 區：徽章 + 標題 + 描述。給一致 min-height，讓四張卡的引言框在同一水平線起始（描述長就自然換行，不截字）。 */}
      <div className="min-h-[100px]">
        <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}>
          <Icon className="h-3 w-3" />
          {opp.typeLabel ?? meta.label}
        </span>

        <h3 className="mt-2.5 text-[15px] font-semibold leading-snug text-gray-900">{opp.title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{opp.whyNow}</p>
      </div>

      {/* Highlight 區：AI 建議切角，高度自然延伸；padding／圓角／字級／間距統一 */}
      {opp.suggestedAngle && (
        <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 ${meta.quoteClass}`}>
          <Quote className={`mt-0.5 h-4 w-4 shrink-0 ${meta.markClass}`} fill="currentColor" />
          <p className="text-xs italic leading-relaxed">{opp.suggestedAngle}</p>
        </div>
      )}

      {/* 底部區：來源標示 + CTA 一起 mt-auto 貼底，四張卡底部對齊 */}
      <div className="mt-auto">
        {/* 這張卡憑什麼資料來的。外部訊號來源會失效（額度用盡／訂閱到期）而系統設計成不阻斷，
            沒有這行使用者分不出「真的有熱度」和「只是當季常青題」。 */}
        {opp.sourceLabel && (
          <p className="flex items-center gap-1 pt-3 text-[11px] leading-none text-gray-400">
            <Radar className="h-3 w-3 shrink-0" />
            來源：{opp.sourceLabel}
          </p>
        )}
        <div className="flex items-center gap-1.5 pt-3">
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
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-50"
            >
              {opp.cta ?? "AI 怎麼切入"} <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onUsePost(opp)}
              disabled={busy || disabled}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {busy ? "準備中…" : "用這個做貼文"}
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
