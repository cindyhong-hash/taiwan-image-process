"use client";
/**
 * 首頁「今日靈感」小卡（第十七節）。刻意輕量：不打 LLM（避免每次進首頁都花 API），
 * 只用當月季節 hook 當引子，點「查看靈感」導去 /inspiration（真正的推薦在那裡即時生成）。
 */
import Link from "next/link";
import { Lightbulb, ArrowRight } from "lucide-react";

const MONTH_HOOK: Record<number, string> = {
  1: "農曆春節前採買正熱",
  2: "農曆新年 × 情人節檔期",
  3: "初春換季保養升溫",
  4: "春季踏青與兒童節",
  5: "母親節 × 初夏防曬季",
  6: "夏季消暑與畢業季",
  7: "盛夏戶外・除毛需求高峰",
  8: "七夕 × 開學前準備",
  9: "入秋換季保養正在升溫",
  10: "秋季乾燥肌護理",
  11: "雙11購物節檔期",
  12: "耶誕 × 年末回顧",
};

export function TodayInspirationCard({ clientId }: { clientId: string }) {
  const hook = MONTH_HOOK[new Date().getMonth() + 1] ?? "AI 幫你找到值得做的內容";
  return (
    <Link
      href={`/clients/${clientId}/inspiration`}
      className="block rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50/60 p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
          <Lightbulb className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold text-gray-900">今日靈感</p>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-gray-600">🔥 {hook}</p>
      <p className="mt-1 text-[11px] text-gray-400">AI 根據你的品牌與近期趨勢，找出最值得把握的內容。</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600">
        查看靈感 <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
