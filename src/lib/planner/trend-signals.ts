/**
 * Trend Signals — 可注入的外部趨勢訊號架構（Flow A / trend-signals spec）。
 *
 * 設計原則：
 * 1. Provider 可插拔：新增來源＝加一個 adapter，呼叫端零改動。
 * 2. 永不阻斷：任何 provider 失敗 → 空陣列，生成照常。
 * 3. Topic 生成時把 signals 當 grounding；每篇保存 recommendationReason + sourceSignals。
 * 4. 第一版只用「重要日期」(真實) + Mock，不接任何第三方。
 *
 * 已接：重要日期(真實) + Mock + Threads(RapidAPI，有 RAPIDAPI_KEY 才啟用)。
 */
import { chatTextOpenRouter } from "@/lib/openrouter";

export type TrendSignalKind = "event" | "keyword" | "hashtag" | "season";

export type TrendSignal = {
  id: string;
  source: string; // "important-date" | "mock" | "google-trends" | ...
  kind: TrendSignalKind;
  label: string;
  score?: number; // 0–1；缺省視為 0.5
  meta?: Record<string, unknown>;
  fetchedAt: string; // ISO
};

export type TrendSignalContext = {
  clientId: string;
  clientName: string;
  year: number;
  month: number;
  goals: string[];
  campaigns: { id: string; name: string; goals: string[] }[];
  importantDates: { date: string | Date; label: string }[];
  industry?: string;      // 品牌產業（讓趨勢查詢貼著產品類別）
  products?: string[];    // 關聯產品名稱（查詢/相關性用）
};

export interface TrendSignalProvider {
  name: string;
  fetch(ctx: TrendSignalContext): Promise<TrendSignal[]>;
}

const nowIso = () => new Date().toISOString();
const mmdd = (d: string | Date) => { const dt = new Date(d); return `${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}`; };

/** 內建 provider：把 plan 既有的重要日期轉成訊號（第一版唯一的「真實」訊號源，非第三方）。 */
const importantDateProvider: TrendSignalProvider = {
  name: "important-date",
  async fetch(ctx) {
    return ctx.importantDates
      .filter((d) => d.label)
      .map((d, i) => ({
        id: `important-date:${ctx.year}-${ctx.month}:${i}:${mmdd(d.date)}`,
        source: "important-date",
        kind: "event" as const,
        label: `${mmdd(d.date)} ${d.label}`,
        score: 0.7,
        meta: { date: new Date(d.date).toISOString() },
        fetchedAt: nowIso(),
      }));
  },
};

/** Mock provider：讀 TREND_SIGNALS_MOCK（JSON array），否則回空。之後由真實 adapter 取代。 */
const mockProvider: TrendSignalProvider = {
  name: "mock",
  async fetch() {
    const raw = process.env.TREND_SIGNALS_MOCK;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((s: Record<string, unknown>, i: number) => ({
        id: String(s.id ?? `mock:${i}`),
        source: "mock",
        kind: (["event", "keyword", "hashtag", "season"].includes(String(s.kind)) ? s.kind : "keyword") as TrendSignalKind,
        label: String(s.label ?? ""),
        score: typeof s.score === "number" ? s.score : 0.5,
        meta: (s.meta as Record<string, unknown>) ?? {},
        fetchedAt: nowIso(),
      })).filter((s) => s.label);
    } catch {
      return [];
    }
  },
};

/** 遞迴撈出 Threads 回應裡的貼文文字（欄位埋很深，只抓 plaintext，避開雜訊）。 */
function collectThreadTexts(node: unknown, out: string[], depth = 0): void {
  if (node == null || depth > 12 || out.length >= 40) return;
  if (Array.isArray(node)) { for (const x of node) collectThreadTexts(x, out, depth + 1); return; }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "plaintext" && typeof v === "string" && v.trim().length > 4) out.push(v.trim());
      else collectThreadTexts(v, out, depth + 1);
    }
  }
}

const isGenericProduct = (p: string) => /^產品\s*\d*$/.test(p.trim()) || !p.trim();

/** 自動推導「適合社群搜尋」的產品類別關鍵字（避免用太利基的品牌名，如 舒適牌女刀 → 除毛/除毛刀）。
 *  LLM 失敗時退回描述性產品名 → 品牌名。 */
async function deriveTrendKeywords(ctx: TrendSignalContext): Promise<string[]> {
  const products = (ctx.products ?? []).filter((p) => !isGenericProduct(p));
  const fallback = [products[0] || ctx.clientName].filter((k): k is string => !!k && k.trim().length > 0).map((k) => k.trim());
  const facts = [
    ctx.clientName && `品牌：${ctx.clientName}`,
    ctx.industry && `產業：${ctx.industry}`,
    products.length && `產品：${products.join("、")}`,
    ctx.goals?.length && `目標：${ctx.goals.join("、")}`,
  ].filter(Boolean).join("；");
  try {
    const prompt = `根據以下品牌資訊，給 2-3 個用來在社群平台(Threads/Instagram)搜尋的繁體中文關鍵字。\n規則：要「簡短、常見、大範圍」的單一詞(2-4 字，聚焦產品『大類別』)，不要加「女性/男性/居家」等修飾、也不要組合成長詞，太具體會搜不到。例：女除毛刀→「除毛」、精華液→「保養」、女鞋→「穿搭」。只回 JSON 字串陣列，例如 ["除毛","美體"]。\n${facts}`;
    const out = await chatTextOpenRouter(prompt, 200);
    const parsed = JSON.parse((out ?? "[]").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    const kws = Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.trim()) : [];
    return kws.length ? kws.slice(0, 3) : fallback;
  } catch {
    return fallback;
  }
}

/** Threads 趨勢 provider（RapidAPI）：自動推導產品類別關鍵字 → 搜近期貼文 → LLM 萃取可做的題材。
 *  需 RAPIDAPI_KEY；沒設就不啟用。任何失敗都回空，不阻斷主題生成。 */
const threadsProvider: TrendSignalProvider = {
  name: "threads",
  async fetch(ctx) {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) return [];
    const keywords = await deriveTrendKeywords(ctx);
    if (!keywords.length) return [];
    // 三個關鍵字「並行」抓（各自 15s timeout，單一失敗不影響其他），再合併。
    const perKeyword = await Promise.all(
      keywords.slice(0, 3).map(async (kw) => {
        const bucket: string[] = [];
        try {
          const res = await fetch(`https://threads-scraper-api2.p.rapidapi.com/api/v1/search/top?query=${encodeURIComponent(kw)}`, {
            headers: { "x-rapidapi-host": "threads-scraper-api2.p.rapidapi.com", "x-rapidapi-key": key },
            signal: AbortSignal.timeout(15000),
          });
          if (res.ok) collectThreadTexts(await res.json().catch(() => null), bucket);
        } catch { /* 跳過這個關鍵字 */ }
        return bucket;
      }),
    );
    const uniq = [...new Set(perKeyword.flat())].slice(0, 25);
    if (!uniq.length) return [];
    const kwLabel = keywords.join("、");
    try {
      const prompt = `以下是 Threads 上搜尋「${kwLabel}」的近期貼文文字。請萃取 5-8 個與「${kwLabel}」相關、適合台灣品牌社群貼文的「近期話題／角度」。只回 JSON array，每項 {"label":"繁中短語(≤16字)","score":0到1熱度}。不得杜撰與貼文無關的內容；若都不相關就回 []。\n貼文：\n${uniq.map((t, i) => `${i + 1}. ${t.slice(0, 200)}`).join("\n")}`;
      const out = await chatTextOpenRouter(prompt, 800);
      const parsed = JSON.parse((out ?? "[]").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, 8).map((s: Record<string, unknown>, i: number) => ({
        id: `threads:${normLabel(kwLabel)}:${i}`,
        source: "threads",
        kind: "keyword" as const,
        label: String(s.label ?? "").trim(),
        score: typeof s.score === "number" ? Math.max(0, Math.min(1, s.score)) : 0.6,
        meta: { keywords },
        fetchedAt: nowIso(),
      })).filter((s) => s.label);
    } catch { return []; }
  },
};

/**
 * 台灣季節／節慶靜態資料（無外部 API）。key = 月份(1–12)，每項 {label, kind, score}。
 * 供靈感中心「季節時事 / 節日行銷」機會使用；importantDate（使用者輸入）之外的常青脈絡。
 */
const TAIWAN_SEASONAL: Record<number, { label: string; kind: TrendSignalKind; score: number }[]> = {
  1: [{ label: "新年新氣象", kind: "season", score: 0.7 }, { label: "尾牙／年終", kind: "event", score: 0.65 }, { label: "農曆春節前採買", kind: "event", score: 0.75 }],
  2: [{ label: "農曆新年", kind: "event", score: 0.8 }, { label: "情人節", kind: "event", score: 0.75 }, { label: "開工開學收心", kind: "season", score: 0.6 }],
  3: [{ label: "初春換季", kind: "season", score: 0.7 }, { label: "白色情人節", kind: "event", score: 0.6 }, { label: "婦女節", kind: "event", score: 0.55 }],
  4: [{ label: "春季賞花踏青", kind: "season", score: 0.65 }, { label: "清明連假", kind: "event", score: 0.6 }, { label: "兒童節", kind: "event", score: 0.55 }],
  5: [{ label: "母親節", kind: "event", score: 0.8 }, { label: "初夏防曬季開始", kind: "season", score: 0.7 }, { label: "梅雨潮濕護理", kind: "season", score: 0.55 }],
  6: [{ label: "夏季消暑", kind: "season", score: 0.7 }, { label: "端午連假", kind: "event", score: 0.65 }, { label: "畢業季", kind: "event", score: 0.6 }],
  7: [{ label: "盛夏戶外／泳裝季", kind: "season", score: 0.72 }, { label: "暑假出遊", kind: "season", score: 0.68 }, { label: "夏日除毛需求高峰", kind: "season", score: 0.7 }],
  8: [{ label: "七夕情人節", kind: "event", score: 0.72 }, { label: "父親節", kind: "event", score: 0.68 }, { label: "開學前準備", kind: "season", score: 0.65 }],
  9: [{ label: "入秋換季保養", kind: "season", score: 0.75 }, { label: "開學季", kind: "event", score: 0.68 }, { label: "9/9 購物節", kind: "event", score: 0.6 }, { label: "中秋節", kind: "event", score: 0.7 }],
  10: [{ label: "秋季乾燥肌護理", kind: "season", score: 0.7 }, { label: "雙十連假", kind: "event", score: 0.6 }, { label: "萬聖節", kind: "event", score: 0.6 }],
  11: [{ label: "雙11購物節", kind: "event", score: 0.82 }, { label: "換季保暖", kind: "season", score: 0.68 }, { label: "感恩節／黑五", kind: "event", score: 0.65 }],
  12: [{ label: "耶誕節", kind: "event", score: 0.78 }, { label: "雙12購物節", kind: "event", score: 0.72 }, { label: "年末回顧／跨年", kind: "season", score: 0.7 }, { label: "冬季乾燥護理", kind: "season", score: 0.62 }],
};

/** 季節／節慶 provider：依 ctx.month 給當月常青季節脈絡（不需任何 API key）。 */
const seasonalProvider: TrendSignalProvider = {
  name: "seasonal",
  async fetch(ctx) {
    const items = TAIWAN_SEASONAL[ctx.month] ?? [];
    return items.map((s, i) => ({
      id: `seasonal:${ctx.month}:${i}:${normLabel(s.label)}`,
      source: "seasonal",
      kind: s.kind,
      label: s.label,
      score: s.score,
      meta: { month: ctx.month },
      fetchedAt: nowIso(),
    }));
  },
};

/** 本版啟用的 providers。Threads 只在有 RAPIDAPI_KEY 時掛上（沒設自動跳過、不影響現有）。 */
export function getTrendProviders(): TrendSignalProvider[] {
  return [importantDateProvider, seasonalProvider, mockProvider, ...(process.env.RAPIDAPI_KEY ? [threadsProvider] : [])];
}

const normLabel = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** 合併所有 provider、去重（先 id 後正規化 label）、依 score 由高到低排序。單一 provider 失敗 → 略過不炸。 */
export async function collectTrendSignals(ctx: TrendSignalContext): Promise<TrendSignal[]> {
  const providers = getTrendProviders();
  const results = await Promise.all(providers.map((p) => p.fetch(ctx).catch(() => [] as TrendSignal[])));
  const seenId = new Set<string>();
  const seenLabel = new Set<string>();
  const merged: TrendSignal[] = [];
  for (const sig of results.flat()) {
    const key = normLabel(sig.label);
    if (seenId.has(sig.id) || seenLabel.has(key)) continue;
    seenId.add(sig.id);
    seenLabel.add(key);
    merged.push(sig);
  }
  return merged.sort((a, b) => (b.score ?? 0.5) - (a.score ?? 0.5));
}

/** 防幻覺：只保留 id 或 label 確實在本次 signals 集合內的引用。 */
export function filterCitedSignals(cited: unknown, signals: TrendSignal[]): { id: string; source: string; label: string; score?: number }[] {
  if (!Array.isArray(cited)) return [];
  const byId = new Map(signals.map((s) => [s.id, s]));
  const byLabel = new Map(signals.map((s) => [normLabel(s.label), s]));
  const out: { id: string; source: string; label: string; score?: number }[] = [];
  const used = new Set<string>();
  for (const raw of cited) {
    const key = String(raw ?? "");
    const sig = byId.get(key) ?? byLabel.get(normLabel(key));
    if (sig && !used.has(sig.id)) {
      used.add(sig.id);
      out.push({ id: sig.id, source: sig.source, label: sig.label, score: sig.score });
    }
  }
  return out;
}
