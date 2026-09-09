"use client";
/**
 * 靈感中心主體。串起：搜尋框 → /api/inspiration → 兩區（內容機會 / 為你推薦）→
 * 「用這個做貼文」寫 handoff 導去既有建立圖文流程。收藏存 localStorage。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2, Lightbulb, Settings, Package, MessageCircle } from "lucide-react";
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

/** 靈感中心的捲動位置（離開建立圖文流程回來時還原）。 */
const SCROLL_KEY = "inspirationScrollY";
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
  // 機會卡與推薦卡各自的 loading：兩段是並行請求，哪段先回就先渲染，
  // 不要讓比較慢的推薦卡（8 則）拖住比較快的機會卡（3 則）。
  const [loading, setLoading] = useState(true);          // 機會卡
  const [loadingRecs, setLoadingRecs] = useState(true);  // 推薦卡
  const [result, setResult] = useState<InspirationResult | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  // 點「用這個做貼文」後要即時生成畫面描述。記「哪一張」在準備，
  // 不能只記一個布林值 —— 那會讓所有卡片一起轉，看不出是哪張在動。
  const [briefingId, setBriefingId] = useState<string | null>(null);
  const [angleOpp, setAngleOpp] = useState<Opportunity | null>(null);
  // 「再換一批」：累積已看過的標題，送進 API 的 avoid（後端會避開這些，且不吃 10 分鐘快取）。
  const seenTitlesRef = useRef<string[]>([]);

  const remember = useCallback((titles: (string | undefined)[]) => {
    seenTitlesRef.current = [...new Set([...seenTitlesRef.current, ...titles].filter(Boolean) as string[])].slice(-40);
  }, []);

  const fetchInspiration = useCallback(
    (opts: { query?: string; filter?: InspirationTag | ""; avoid?: string[] }) => {
      const payload = {
        clientId,
        query: opts.query ?? "",
        filter: opts.filter || "all",
        ...(opts.avoid?.length ? { avoid: opts.avoid } : {}),
      };
      const call = (part: "opportunities" | "recommendations") =>
        fetch("/api/inspiration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, part }),
        }).then((r) => r.json() as Promise<InspirationResult>);

      setLoading(true);
      setLoadingRecs(true);

      // 兩段並行、各自結束各自的 loading。機會卡（3 則）通常比推薦卡（8 則）早很多回來。
      call("opportunities")
        .then((data) => {
          setResult(data);
          remember((data.opportunities ?? []).map((o) => o.title));
        })
        .catch(() => setResult({ opportunities: [], recommendations: [], meta: { hasBrand: false, hasProduct: false, signalCount: 0, needBrandSetup: false, needProduct: false } }))
        .finally(() => setLoading(false));

      call("recommendations")
        .then((data) => {
          setRecs(data.recommendations ?? []);
          remember((data.recommendations ?? []).map((r) => r.title));
        })
        .catch(() => setRecs([]))
        .finally(() => setLoadingRecs(false));
    },
    [clientId, remember],
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

  // 捲動位置：去建立圖文又放棄回來時，回到原本看到的那一批靈感的位置，
  // 而不是被丟回頁面最上面重新找。離開時記、回來時還原一次就清掉。
  // 只掛 pagehide（整頁離開）。不要在 unmount 時存：Next 換頁會先把捲軸歸零，
  // 等到 cleanup 執行時 window.scrollY 已經是 0，存了也沒用。
  useEffect(() => {
    const save = () => {
      try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); } catch { /* 無痕模式等 */ }
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, []);

  useEffect(() => {
    if (loading || !result) return;
    // 這裡「讀了不馬上刪」：開發模式的 StrictMode 會把 effect 跑兩次
    // （第一次排的計時器會被 cleanup 清掉），先刪掉 key 的話第二次就讀不到了。
    // 改成最後一次嘗試之後才清。
    let y: number | null = null;
    try {
      const raw = sessionStorage.getItem(SCROLL_KEY);
      if (raw) y = Number(raw);
    } catch { /* ignore */ }
    if (y == null || !Number.isFinite(y) || y <= 0) {
      try { sessionStorage.removeItem(SCROLL_KEY); } catch { /* ignore */ }
      return;
    }
    // 卡片渲染完不代表頁面已經夠高——推薦區的圖還在載，捲過去會被夾成 0。
    // 分幾次重試，直到真的捲到定位或放棄（約 1.5 秒）。
    const target = y;
    const delays = [0, 100, 250, 500, 900, 1400];
    const timers = delays.map((d, i) =>
      window.setTimeout(() => {
        if (Math.abs(window.scrollY - target) > 4) window.scrollTo({ top: target, behavior: "auto" });
        if (i === delays.length - 1) { try { sessionStorage.removeItem(SCROLL_KEY); } catch { /* ignore */ } }
      }, d),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [loading, result]);

  // 再換一批：把已看過的標題丟進 avoid，後端會避開重複並略過快取
  const handleShuffle = () => fetchInspiration({ query, filter: filterTag, avoid: seenTitlesRef.current });

  // ── 用這個做貼文：opp / rec / angle → InspirationBrief → handoff → 導去既有流程 ──
  const goWithBrief = (brief: InspirationBrief) => {
    // 導頁前先記位置（換頁後 scrollY 就歸零了，來不及）。
    try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); } catch { /* ignore */ }
    const url = startPostFromBrief(brief);
    router.push(url);
  };

  /**
   * 點下去才生成畫面描述與必放文字（約 2 秒）。
   * 這些欄位不再由 /api/inspiration 批量預先產出 —— 11 則裡使用者最多只會點一則，
   * 先幫全部寫好等於白算 10 則，那是首屏慢的主因。
   * 失敗就直接帶原本的 brief 進去（handoff 會退回欄位拼裝法），不擋住使用者。
   */
  const goWithFreshBrief = async (cardId: string, brief: InspirationBrief) => {
    if (briefingId) return;
    setBriefingId(cardId);
    try {
      const res = await fetch("/api/inspiration/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          topic: brief.topic,
          copyDirection: brief.copyDirection,
          visualDirection: brief.visualDirection,
          trendContext: brief.trendContext,
          productLabel: brief.recommendedProduct?.label,
        }),
      });
      if (res.ok) {
        const d = (await res.json()) as { imagePrompt?: string; requiredText?: string };
        goWithBrief({ ...brief, imagePrompt: d.imagePrompt, requiredText: d.requiredText });
        return;
      }
    } catch { /* 落到下面的退路 */ }
    goWithBrief(brief);
  };

  const useOpportunity = (opp: Opportunity) =>
    goWithFreshBrief(opp.id, {
      sourceType: "inspiration",
      clientId,
      topic: opp.title,
      tag: opp.tag,
      suggestedFormat: opp.suggestedFormat ?? "single",
      recommendedProduct: opp.recommendedProduct ?? null,
      copyDirection: opp.suggestedAngle,
      trendContext: opp.whyNow,
      suggestedCount: opp.suggestedCount,
    });

  const useRecommendation = (rec: Recommendation) =>
    goWithFreshBrief(rec.id, {
      sourceType: "inspiration",
      clientId,
      topic: rec.title,
      tag: rec.tag,
      suggestedFormat: rec.suggestedFormat,
      recommendedProduct: rec.recommendedProduct ?? null,
      copyDirection: rec.copyDirection,
      visualDirection: rec.visualDirection,
      trendContext: rec.trendContext,
      suggestedCount: rec.suggestedCount,
    });

  const useAngle = (opp: Opportunity, angle: ContentAngle) => {
    setAngleOpp(null);
    void goWithFreshBrief(opp.id, {
      sourceType: "inspiration",
      clientId,
      topic: angle.title,
      tag: opp.tag,
      suggestedFormat: opp.suggestedFormat ?? "single",
      recommendedProduct: opp.recommendedProduct ?? null,
      copyDirection: angle.copyDirection,
      trendContext: opp.whyNow,
      // 換了切角，畫面就不一樣了——不沿用原機會的 imagePrompt，讓它退回拼裝法。
      suggestedCount: opp.suggestedCount,
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
  const recommendations = recs ?? [];
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
                    busy={briefingId === opp.id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 第二區：為你推薦的靈感 */}
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-gray-900">為你推薦的靈感</h2>
            <p className="mt-1 text-sm text-gray-500">綜合近期話題、品牌相關性與可製作性，精選適合你的內容題目。</p>

            {loadingRecs ? (
              // 推薦卡比機會卡慢（8 則 vs 3 則），先出等高骨架佔位，版面不會跳。
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    <div className="aspect-[4/3] w-full bg-gray-100" />
                    <div className="space-y-2 p-3.5">
                      <div className="h-4 w-3/4 rounded bg-gray-100" />
                      <div className="h-3 w-full rounded bg-gray-100" />
                      <div className="h-3 w-2/3 rounded bg-gray-100" />
                      <div className="mt-3 h-8 w-full rounded-lg bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recommendations.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {recommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    rec={rec}
                    onUsePost={useRecommendation}
                    busy={briefingId === rec.id}
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
            <p className="max-w-md text-xs text-gray-500">換一批不重複的建議，或在上方搜尋你想做的主題。</p>
            <button
              type="button"
              onClick={handleShuffle}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" /> 再換一批
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

