/**
 * Trend Signals — 可注入的外部趨勢訊號架構（Flow A / trend-signals spec）。
 *
 * 設計原則：
 * 1. Provider 可插拔：新增來源＝加一個 adapter，呼叫端零改動。
 * 2. 永不阻斷：任何 provider 失敗 → 空陣列，生成照常。
 * 3. Topic 生成時把 signals 當 grounding；每篇保存 recommendationReason + sourceSignals。
 * 4. 第一版只用「重要日期」(真實) + Mock，不接任何第三方。
 *
 * 未來要接 Google Trends / RapidAPI：實作一個新的 TrendSignalProvider 加進 getTrendProviders()。
 */

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

/** 本版啟用的 providers。未來依 env / client 設定加掛第三方。 */
export function getTrendProviders(): TrendSignalProvider[] {
  return [importantDateProvider, mockProvider];
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
