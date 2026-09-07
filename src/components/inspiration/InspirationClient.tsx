"use client";
/**
 * 靈感中心主體。串起：搜尋框 → /api/inspiration → 兩區（內容機會 / 為你推薦）→
 * 「用這個做貼文」寫 handoff 導去既有建立圖文流程。收藏存 localStorage。
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Lightbulb, Settings, Package, MessageCircle } from "lucide-react";
import {
  ACTIVITY_HANDOFF_KEY,
  ACTIVITY_REF_KEY,
  ACTIVITY_BASE_KEY,
  ACTIVITY_IMAGE_PROMPT_KEY,
  ACTIVITY_UPDATE_FLAGS_KEY,
} from "@/components/activities/RolePickerModal";
import { detectUpdateFlags } from "@/lib/updateFlags";
import { startPostFromBrief } from "@/lib/inspiration/handoff";
import {
  type ContentAngle,
  type InspirationBrief,
  type InspirationResult,
  type InspirationTag,
  type Opportunity,
  type Recommendation,
} from "@/lib/inspiration/types";
import { InspirationSearchBar } from "./InspirationSearchBar";
import { OpportunityCard } from "./OpportunityCard";
import { RecommendationCard } from "./RecommendationCard";
import { AngleDrawer } from "./AngleDrawer";

const CHIP_TO_TAG: Record<string, InspirationTag | ""> = {
  熱門話題: "",
  季節時事: "seasonal",
  節日行銷: "holiday",
  產品應用: "product",
  知識教育: "knowledge",
  生活風格: "lifestyle",
  互動話題: "engagement",
};

export function InspirationClient({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState("熱門話題");
  const [filterTag, setFilterTag] = useState<InspirationTag | "">("");
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<InspirationResult | null>(null);
  const [angleOpp, setAngleOpp] = useState<Opportunity | null>(null);

  const fetchInspiration = useCallback(
    async (opts: { query?: string; filter?: InspirationTag | "" }) => {
      setLoading(true);
      try {
        const res = await fetch("/api/inspiration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            query: opts.query ?? "",
            filter: opts.filter || "all",
          }),
        });
        const data = (await res.json()) as InspirationResult;
        setResult(data);
      } catch {
        setResult({ opportunities: [], recommendations: [], meta: { hasBrand: false, hasProduct: false, signalCount: 0, needBrandSetup: false, needProduct: false } });
      } finally {
        setLoading(false);
      }
    },
    [clientId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 進頁載入推薦（fetch 內部管理 loading）
    fetchInspiration({});
  }, [fetchInspiration]);

  const handleChip = (chip: string) => {
    setActiveChip(chip);
    const tag = CHIP_TO_TAG[chip] ?? "";
    setFilterTag(tag);
    fetchInspiration({ query, filter: tag });
  };

  // ── 用這個做貼文：opp / rec / angle → InspirationBrief → handoff → 導去既有流程 ──
  const goWithBrief = (brief: InspirationBrief) => {
    const url = startPostFromBrief(brief);
    router.push(url);
  };

  const useOpportunity = (opp: Opportunity) =>
    goWithBrief({
      sourceType: "inspiration",
      clientId,
      topic: opp.title,
      tag: opp.tag,
      suggestedFormat: opp.suggestedFormat ?? "single",
      recommendedProduct: opp.recommendedProduct ?? null,
      copyDirection: opp.suggestedAngle,
      trendContext: opp.whyNow,
    });

  const useRecommendation = (rec: Recommendation) =>
    goWithBrief({
      sourceType: "inspiration",
      clientId,
      topic: rec.title,
      tag: rec.tag,
      suggestedFormat: rec.suggestedFormat,
      recommendedProduct: rec.recommendedProduct ?? null,
      copyDirection: rec.copyDirection,
      visualDirection: rec.visualDirection,
      trendContext: rec.trendContext,
    });

  const useAngle = (opp: Opportunity, angle: ContentAngle) => {
    setAngleOpp(null);
    goWithBrief({
      sourceType: "inspiration",
      clientId,
      topic: angle.title,
      tag: opp.tag,
      suggestedFormat: opp.suggestedFormat ?? "single",
      recommendedProduct: opp.recommendedProduct ?? null,
      copyDirection: angle.copyDirection,
      trendContext: opp.whyNow,
    });
  };

  // ── 再次使用舊活動（同 dashboard handleReuse）──────────────────────────────────
  const handleReuse = async (activityId: string) => {
    try {
      const a = await fetch(`/api/activities/${activityId}`).then((r) => r.json());
      const products: string[] = Array.isArray(a.productImageUrls) ? a.productImageUrls : [];
      const flags = detectUpdateFlags(a.theme, a.titleText, a.imagePrompt);
      sessionStorage.removeItem(ACTIVITY_REF_KEY);
      sessionStorage.removeItem(ACTIVITY_BASE_KEY);
      sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
      sessionStorage.setItem(
        ACTIVITY_HANDOFF_KEY,
        JSON.stringify({ clientId, imagePrompt: a.imagePrompt ?? a.theme ?? "", requiredText: a.titleText ?? "", productImageUrls: products }),
      );
      if (flags.length) sessionStorage.setItem(ACTIVITY_UPDATE_FLAGS_KEY, JSON.stringify(flags));
      else sessionStorage.removeItem(ACTIVITY_UPDATE_FLAGS_KEY);
    } catch {
      /* ignore — 仍導去空白新增頁 */
    }
    router.push(`/clients/${clientId}/activities/new`);
  };

  // 機會卡固定顯示順序：升溫 → 值得準備 → 品牌內容缺口 → 你可以重新利用（重新利用放最右）
  const OPP_ORDER: Record<string, number> = { trend: 0, upcoming: 1, gap: 2, reuse: 3 };
  const opportunities = [...(result?.opportunities ?? [])].sort(
    (a, b) => (OPP_ORDER[a.type] ?? 9) - (OPP_ORDER[b.type] ?? 9),
  );
  const recommendations = result?.recommendations ?? [];
  const meta = result?.meta;

  return (
    <div className="mx-auto max-w-6xl pb-16">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Lightbulb className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-bold text-gray-900">靈感中心</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
          不知道今天要發什麼？AI 根據你的品牌、產品與近期趨勢，幫你找到最值得做的內容。
        </p>
      </div>

      {/* Search */}
      <InspirationSearchBar
        value={query}
        onChange={setQuery}
        onSubmit={() => fetchInspiration({ query, filter: filterTag })}
        activeChip={activeChip}
        onChip={handleChip}
        loading={loading}
      />

      {/* Empty-state 引導（不阻擋，仍照常出內容）*/}
      {meta && (meta.needBrandSetup || meta.needProduct) && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            {meta.needBrandSetup
              ? "完成品牌設定，AI 才能提供更適合你的靈感。"
              : "新增產品後，AI 可以幫你把熱門話題與產品連結起來（現在仍能給品牌／知識／生活風格靈感）。"}
          </span>
          <button
            type="button"
            onClick={() => router.push(`/clients/${clientId}/${meta.needBrandSetup ? "settings" : "components"}`)}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            {meta.needBrandSetup ? <Settings className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
            {meta.needBrandSetup ? "完善品牌設定" : "新增產品"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> AI 正在為你整理靈感…
        </div>
      ) : (
        <>
          {/* 第一區：內容機會 */}
          {opportunities.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-gray-900">今天有 {opportunities.length} 個內容機會</h2>
              <p className="mt-1 text-sm text-gray-500">根據你的品牌、產品、近期趨勢與過往內容，AI 為你整理最值得把握的靈感。</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {opportunities.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opp={opp}
                    onUsePost={useOpportunity}
                    onOpenAngles={setAngleOpp}
                    onReuse={handleReuse}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 第二區：為你推薦的靈感 */}
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-gray-900">為你推薦的靈感</h2>
            <p className="mt-1 text-sm text-gray-500">綜合近期話題、品牌相關性與可製作性，精選適合你的內容題目。</p>

            {recommendations.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {recommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    rec={rec}
                    onUsePost={useRecommendation}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
                這個類型暫時沒有推薦，換個 filter 或按「找靈感」再試。
              </div>
            )}
          </section>

          {/* 底部 banner（第十六節）*/}
          <div className="mt-12 flex flex-col items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-6 py-8 text-center">
            <MessageCircle className="h-6 w-6 text-violet-400" />
            <p className="text-sm font-medium text-gray-700">想要更多靈感？</p>
            <p className="max-w-md text-xs text-gray-500">告訴 AI 你的想法、目標或想推的產品，獲得更個人化的內容建議。</p>
            <button
              type="button"
              onClick={() => {
                const el = document.querySelector<HTMLInputElement>("input");
                el?.focus();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
            >
              <Sparkles className="h-4 w-4" /> 和 AI 聊聊我的靈感
            </button>
          </div>
        </>
      )}

      {angleOpp && (
        <AngleDrawer clientId={clientId} opp={angleOpp} onClose={() => setAngleOpp(null)} onUseAngle={useAngle} />
      )}
    </div>
  );
}

