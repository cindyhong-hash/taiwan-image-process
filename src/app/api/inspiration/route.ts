/**
 * 靈感中心 API — 綜合品牌設定 + 產品 + 過往內容 + 外部趨勢訊號，產出：
 *   - opportunities：今天有 X 個內容機會（trend / upcoming / gap 由 AI 產、reuse 由伺服器依真實舊活動組）
 *   - recommendations：為你推薦的靈感（可一鍵帶入建立圖文）
 *
 * 重用：buildPlannerContext（品牌 context）、collectTrendSignals（可插拔趨勢，含季節/節慶/Threads）、
 *       chatTextOpenRouter（同 topics route 的 prompt→JSON idiom）。
 * 防幻覺：產品 label / reuse 活動 id 都對照真實資料驗證；brandFit clamp 0–100；tag/format 白名單。
 * 誠實原則：reuse 不使用捏造的互動數據，只用「同期做過」這類質化說明。
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatTextOpenRouter } from "@/lib/openrouter";
import { collectTrendSignals, type TrendSignal } from "@/lib/planner/trend-signals";
import { buildPlannerContext } from "@/lib/planner/planner-context";
import {
  INSPIRATION_TAGS,
  type InspirationResult,
  type InspirationTag,
  type Opportunity,
  type Recommendation,
  type RecommendedProduct,
} from "@/lib/inspiration/types";

export const maxDuration = 60;

// 記憶體快取：同 clientId+月份+filter+query 短時間內重複請求直接回快取，
// 讓「再次進頁 / 切 chip / 返回上一頁」不必再等 LLM。serverless 各實例各自快取，暖啟動內有效。
// 有帶 avoid（要求換一批）時不吃快取。
type CacheEntry = { at: number; data: InspirationResult };
const INSPIRATION_CACHE = new Map<string, CacheEntry>();
const INSPIRATION_TTL_MS = 10 * 60 * 1000;
const inspirationCacheKey = (clientId: string, month: number, filter: string, query: string) =>
  `${clientId}|${month}|${filter || "all"}|${query.trim().toLowerCase()}`;

type Product = { label: string; imageUrl: string };

function parseStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function extractJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const cleanTag = (raw: unknown): InspirationTag =>
  INSPIRATION_TAGS.includes(String(raw) as InspirationTag) ? (String(raw) as InspirationTag) : "brand";
const cleanFormat = (raw: unknown): "single" | "carousel" => (raw === "carousel" ? "carousel" : "single");
const clampFit = (raw: unknown): number | undefined => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined;
};

/** 依 label 對照真實產品（不分大小寫）；找不到就回 null，避免幻覺產品。 */
function resolveProduct(label: unknown, products: Product[]): RecommendedProduct | null {
  const s = String(label ?? "").trim();
  if (!s) return null;
  const hit = products.find((p) => p.label.trim().toLowerCase() === s.toLowerCase());
  if (hit) return { label: hit.label, imageUrl: hit.imageUrl };
  // 沒對到真實產品：只保留名稱（不帶圖），且必須是模型從清單挑的才留，否則丟棄
  return null;
}

/** 依真實舊活動組「你可以重新利用」機會（誠實：不編互動數據）。 */
function buildReuseOpportunity(
  activities: { id: string; theme: string; createdAt: Date; layoutId: string | null; status: string }[],
  avoidTitles: string[] = [],
): Opportunity | null {
  const usable = activities.filter((a) => a.status === "DONE" && a.layoutId !== "magic-layers" && a.theme);
  // 「再換一批」時避開已看過的舊活動；若全被避開就放寬（有總比沒有好）。
  const skip = new Set(avoidTitles);
  const fresh = usable.filter((a) => !skip.has(a.theme));
  const done = fresh.length ? fresh : usable;
  if (!done.length) return null;
  const now = new Date();
  const curMonth = now.getUTCMonth();
  // 優先：去年（或更早）同月做過的
  const samePeriod = done.find((a) => {
    const d = new Date(a.createdAt);
    return d.getUTCMonth() === curMonth && d.getUTCFullYear() < now.getUTCFullYear();
  });
  // 次選：60 天前做過、可翻新的
  const stale = done.find((a) => now.getTime() - new Date(a.createdAt).getTime() > 60 * 86400_000);
  const pick = samePeriod ?? stale;
  if (!pick) return null;
  const d = new Date(pick.createdAt);
  const ym = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const reuseNote = samePeriod ? `去年同期（${ym}）做過這個主題` : `${ym} 做過，可翻新成現在的版本`;
  return {
    id: `reuse:${pick.id}`,
    type: "reuse",
    title: pick.theme,
    whyNow: samePeriod ? "去年這個時候做過，現在正是再做一次的時機。" : "先前表現不錯的主題，換個新角度重新利用。",
    suggestedAngle: "換成今年版本",
    suggestedFormat: (pick.layoutId && pick.layoutId !== "single" ? "carousel" : "single"),
    cta: "查看去年內容",
    reuseActivityId: pick.id,
    reuseNote,
    tag: "brand",
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientId = String(body.clientId ?? "");
  const query = String(body.query ?? "").trim();
  const filter = typeof body.filter === "string" ? body.filter : "";
  const avoid: string[] = Array.isArray(body.avoid) ? body.avoid.map(String) : [];
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const cacheMonth = new Date().getUTCMonth() + 1;
  const cacheKey = inspirationCacheKey(clientId, cacheMonth, filter, query);
  if (!avoid.length) {
    const hit = INSPIRATION_CACHE.get(cacheKey);
    if (hit && Date.now() - hit.at < INSPIRATION_TTL_MS) return NextResponse.json(hit.data);
  }

  const client = await db.client.findUnique({
    where: { id: clientId },
    include: {
      activities: {
        orderBy: { createdAt: "desc" },
        take: 24,
        select: { id: true, theme: true, focusPoint: true, createdAt: true, layoutId: true, status: true },
      },
      marketingPlans: {
        include: { campaigns: { include: { products: true, importantDates: true } } },
      },
    },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // ── 產品：優先取 CampaignProduct，退回 library 產品圖 ───────────────────────────
  const productMap = new Map<string, Product>();
  for (const plan of client.marketingPlans) {
    for (const c of plan.campaigns) {
      for (const p of c.products) {
        if (p.label && !productMap.has(p.label)) productMap.set(p.label, { label: p.label, imageUrl: p.imageUrl });
      }
    }
  }
  if (productMap.size === 0) {
    const libProducts = await db.libraryImage.findMany({
      where: { clientId, status: "DONE", subject: { contains: "product" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { imageUrl: true, prompt: true, subject: true },
    });
    for (const li of libProducts) {
      const label = (li.prompt || li.subject || "").slice(0, 20).trim();
      if (label && !productMap.has(label)) productMap.set(label, { label, imageUrl: li.imageUrl });
    }
  }
  const products = [...productMap.values()];

  // ── 圖片池：給推薦卡當預覽（重用既有 library 圖 / 過往成品，不另生圖）───────────
  const libPool = await db.libraryImage.findMany({
    where: {
      clientId,
      status: "DONE",
      // 推薦卡預覽只用「有產品」的圖：產品套圖裡有產品的角色（主視覺/去背產品/質地/功能細節/使用情境/成品）。
      // 預覽池只取「有產品入鏡」的圖：hero（去背商品）、product、lifestyle（legacy 情境含商品）、finished。
      // 新素材包的 detail(質地)/background/benefit(賣點)/decoration 皆為無產品素材，不當產品預覽；一般貼文成品 assetRole=null 也排除。
      assetRole: { in: ["hero", "product", "lifestyle", "finished"] },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { imageUrl: true },
  });
  const imagePool = [...new Set([...products.map((p) => p.imageUrl), ...libPool.map((l) => l.imageUrl)].filter(Boolean))];

  // ── 品牌 context（重用 planner-context）────────────────────────────────────────
  const toneLabels = client.toneLabels;
  const plannerContext = buildPlannerContext({
    client: { name: client.name, description: client.description, industry: client.industry, toneLabels },
    campaigns: client.marketingPlans.flatMap((plan) =>
      plan.campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        goals: c.goals,
        description: c.description ?? "",
        importantDates: c.importantDates.map((d) => ({ date: d.date, label: d.label })),
        products: c.products.map((p) => ({ id: p.id, label: p.label, imageUrl: p.imageUrl })),
      })),
    ),
  });

  // ── 趨勢訊號（含季節/節慶/Threads）─────────────────────────────────────────────
  const now = new Date();
  const importantDates = client.marketingPlans.flatMap((plan) =>
    plan.campaigns.flatMap((c) => c.importantDates.map((d) => ({ date: d.date, label: d.label }))),
  );
  const signals: TrendSignal[] = await collectTrendSignals({
    clientId,
    clientName: client.name,
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    goals: [],
    campaigns: [],
    importantDates,
    industry: client.industry ?? undefined,
    products: products.map((p) => p.label),
  });

  // ── 過往內容（供 gap 分析 + 誠實 reuse）────────────────────────────────────────
  const recentPosts = client.activities
    .filter((a) => a.theme)
    .slice(0, 12)
    .map((a) => ({ theme: a.theme, month: new Date(a.createdAt).getUTCMonth() + 1 }));

  const hasBrand = Boolean((client.description ?? "").trim()) || parseStrings(toneLabels).length > 0;
  const hasProduct = products.length > 0;

  // ── LLM：一次產出 trend/upcoming/gap 機會 + 6–8 推薦（reuse 由伺服器另組）──────────
  const productLine = products.length
    ? `可帶入的真實產品（只能從中挑，label 必須一字不差）：${JSON.stringify(products.map((p) => p.label))}`
    : "目前沒有可用產品資料：不得杜撰任何具體產品；只給品牌／知識／生活風格／互動型內容。";
  const signalLine = signals.length
    ? `近期外部趨勢訊號（僅供參考，不得杜撰未列出的訊號）：${JSON.stringify(signals.map((s) => ({ label: s.label, kind: s.kind, score: s.score })))}`
    : "（本次沒有外部趨勢訊號）";
  const postsLine = recentPosts.length
    ? `品牌最近的貼文主題（拿來判斷內容缺口 gap；請推斷它們偏向哪些類型，找出偏少的類型）：${JSON.stringify(recentPosts.map((p) => p.theme))}`
    : "（品牌尚無過往貼文）";
  const queryLine = query
    ? `🔴 使用者這次「明確指定」要找的方向：「${query}」。這是本次最高優先指令，凌駕下方一般偏好：
- opportunities 與 recommendations 必須「大多數（至少 opportunities 的 trend/upcoming 兩則 + 過半推薦）」直接圍繞「${query}」發想，標題或 description 要看得出扣住「${query}」，絕不能忽略或悄悄換成別的季節／節慶主題。
- 若「${query}」乍看和品牌不直接相關，你要「主動架一座橋」把它接回品牌的產品、使用情境、受眾或送禮／家人／場景切角（例如把節日轉成「幫家人準備」「送禮」「共同儀式」角度），而不是跳過它改用別的題目。
- 每則的核心是回答：「用『${query}』這個主題，這個品牌具體適合做什麼」。可參考同類型品牌／這個產業面對這種主題常見的切法（用一般性、通則式描述當靈感即可，嚴禁杜撰具體品牌名稱、對手活動或不存在的案例）。
- 只有在真的完全無法與品牌產生任何合理連結時，才可少量補其他方向，且要在 description 明說為何轉向。`
    : "使用者沒有指定方向，請主動給最值得把握的靈感。";
  const filterLine = filter && filter !== "all" ? `使用者只想看這個類型：${filter}` : "";
  const brandAnchor = `品牌：「${client.name}」${client.industry ? `（${client.industry}）` : ""}${
    products.length ? `，主要產品：${products.map((p) => p.label).join("、")}` : ""
  }。`;

  const prompt = `你是這個品牌的專屬社群內容策略師。根據以下資訊，判斷「這個品牌現在最值得做什麼內容」。
${brandAnchor}
品牌與產品事實：${JSON.stringify(plannerContext)}
${productLine}
${signalLine}
${postsLine}
${queryLine}
${filterLine}
${avoid.length ? `避免重複這些（已看過）：${JSON.stringify(avoid)}` : ""}

最重要的規則——「品牌錨定」：
- 每一則機會與推薦都必須明確扣住『這個品牌』的產品類別、使用情境或品牌定位（例如美體除毛／肌膚護理相關）。
- 不得「主動」產生與品牌無關的泛泛內容（例如與品牌產品情境無關的節日、電影、美食、旅遊等一般生活話題）；但若使用者在上方最高優先指令中明確指定了某個方向，則不得略過它——要用「架橋接回品牌」的方式處理，而非改用別的題目。
- 就算是季節/節日/趨勢切入，也要接回品牌能提供的價值或產品使用情境；description 要看得出和品牌的關聯。
- 其他：不得從品牌名猜測產品；不得杜撰未提供的產品/功能/族群；產品資訊不足時只給「品牌理念／該產業知識／該產業生活風格／互動」內容，仍要扣品牌定位。
標題要口語、平台原生、一看想點（最多 1 個 emoji）。

只回傳 JSON 物件，格式：
{
 "opportunities":[
   {"type":"trend","title":"...","whyNow":"為何現在（一句）","brandFit":0到100整數,"recommendedProductLabel":"清單內的label或空字串","suggestedAngle":"一句切角","tag":"seasonal|holiday|product|knowledge|lifestyle|engagement|brand","suggestedFormat":"single|carousel"},
   {"type":"upcoming","title":"...","whyNow":"...","brandFit":0到100,"recommendedProductLabel":"","suggestedAngle":"...","tag":"...","suggestedFormat":"..."},
   {"type":"gap","title":"...","whyNow":"根據上面貼文主題指出缺口，例：最近偏產品介紹，建議補知識型","brandFit":0到100,"recommendedProductLabel":"","suggestedAngle":"建議的下一篇題目","tag":"knowledge","suggestedFormat":"single","gapNote":"一句缺口說明"}
 ],
 "recommendations":[
   {"title":"具體貼文標題","description":"1-2句內容說明（要看得出和品牌/產品的關聯）","tag":"seasonal|holiday|product|knowledge|lifestyle|engagement|brand","brandRelevance":0到100整數（這則和本品牌的相關程度，跟品牌無關者請給低分）,"brandConnection":"一句說明這則如何連到本品牌的產品或定位","recommendedProductLabel":"清單內label或空","suggestedFormat":"single|carousel","copyDirection":"文案方向一句","visualDirection":"畫面方向一句","trendContext":"扣哪個趨勢/節點"}
 ]
}
opportunities 給 trend、upcoming、gap 各一則（共 3 則），brandFit 反映和本品牌的相關度。recommendations 給 6–8 則，全部都要和本品牌高度相關（brandRelevance 盡量 ≥ 70）。`;

  const parsed = extractJsonObject(await chatTextOpenRouter(prompt, 3000));
  const rawOpps = Array.isArray(parsed?.opportunities) ? (parsed!.opportunities as Record<string, unknown>[]) : [];
  const rawRecs = Array.isArray(parsed?.recommendations) ? (parsed!.recommendations as Record<string, unknown>[]) : [];

  const aiOpps: Opportunity[] = rawOpps
    .filter((o) => o && (o.type === "trend" || o.type === "upcoming" || o.type === "gap") && o.title)
    .map((o, i) => ({
      id: `${o.type}:${i}`,
      type: o.type as Opportunity["type"],
      title: String(o.title),
      whyNow: String(o.whyNow ?? ""),
      brandFit: clampFit(o.brandFit),
      recommendedProduct: resolveProduct(o.recommendedProductLabel, products),
      suggestedAngle: o.suggestedAngle ? String(o.suggestedAngle) : undefined,
      tag: cleanTag(o.tag),
      suggestedFormat: cleanFormat(o.suggestedFormat),
      cta: o.type === "trend" ? "AI 怎麼切入" : o.type === "upcoming" ? "產生促銷靈感" : "查看建議題目",
      gapNote: o.gapNote ? String(o.gapNote) : undefined,
    }));

  const reuse = buildReuseOpportunity(client.activities as { id: string; theme: string; createdAt: Date; layoutId: string | null; status: string }[], avoid);

  // 依 spec 順序：trend → upcoming → reuse → gap
  const order: Record<string, number> = { trend: 0, upcoming: 1, reuse: 2, gap: 3 };
  const opportunities = [...aiOpps, ...(reuse ? [reuse] : [])].sort(
    (a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9),
  );

  let imgIdx = 0;
  // 品牌錨定：先按 brandRelevance 由高到低排，濾掉明顯與品牌無關（<50）的推薦。
  // 若濾完太少（模型整批給低分），退回不濾以免空頁，但仍保留排序。
  const withRelevance = rawRecs
    .filter((r) => r && r.title)
    .map((r) => ({ r, rel: clampFit(r.brandRelevance) ?? 60 }))
    .sort((a, b) => b.rel - a.rel);
  const filtered = withRelevance.filter((x) => x.rel >= 50);
  const recSource = (filtered.length >= 3 ? filtered : withRelevance).slice(0, 8).map((x) => x.r);

  const recommendations: Recommendation[] = recSource
    .map((r, i) => {
      const product = resolveProduct(r.recommendedProductLabel, products);
      // 每張卡輪流用池子裡「不同」的圖（避免全用同一支產品圖而長得一樣）；池子空才退回產品圖
      const preview = imagePool[imgIdx++ % Math.max(1, imagePool.length)] ?? product?.imageUrl ?? null;
      return {
        id: `rec:${i}`,
        title: String(r.title),
        description: String(r.description ?? ""),
        tag: cleanTag(r.tag),
        imageUrl: imagePool.length ? preview : null,
        recommendedProduct: product,
        suggestedFormat: cleanFormat(r.suggestedFormat),
        copyDirection: r.copyDirection ? String(r.copyDirection) : undefined,
        visualDirection: r.visualDirection ? String(r.visualDirection) : undefined,
        trendContext: r.trendContext ? String(r.trendContext) : undefined,
      };
    });

  const result: InspirationResult = {
    opportunities,
    recommendations,
    meta: {
      hasBrand,
      hasProduct,
      signalCount: signals.length,
      needBrandSetup: !hasBrand,
      needProduct: !hasProduct,
    },
  };
  if (!avoid.length) INSPIRATION_CACHE.set(cacheKey, { at: Date.now(), data: result });
  return NextResponse.json(result);
}
