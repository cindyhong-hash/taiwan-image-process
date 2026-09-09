/**
 * 台灣行銷日曆（純資料 + 純函式，沒有任何伺服器依賴）。
 *
 * 為什麼獨立成一個模組：這份日曆原本埋在 `src/lib/planner/trend-signals.ts` 裡，
 * 但首頁的「內容再利用機會」也要用它判斷「主題時效」（例如舊的母親節文，
 * 現在母親節又快到了）。分成兩份會各自腐化，所以抽成單一來源，
 * 且刻意不 import 任何 server-only 的東西，前端元件也能直接用。
 */

/** 固定國曆日期的電商檔期。[月, 日, 名稱] */
export const PROMO_FIXED: [number, number, string][] = [
  [1, 1, "元旦跨年檔"],
  [3, 8, "38 女王節"],
  [5, 1, "五一連假檔"],
  [5, 20, "520 告白日"],
  [6, 18, "618 年中慶"],
  [7, 7, "77 購物節"],
  [8, 8, "88 節／父親節檔"],
  [9, 9, "99 購物節"],
  [10, 10, "雙十連假檔"],
  [11, 11, "雙 11 購物節"],
  [12, 12, "雙 12 購物節"],
  [12, 25, "耶誕檔"],
];

/** 母親節：5 月第二個星期日。 */
export function mothersDay(year: number): Date {
  const d = new Date(Date.UTC(year, 4, 1));
  const firstSun = (7 - d.getUTCDay()) % 7;
  return new Date(Date.UTC(year, 4, 1 + firstSun + 7));
}

/** 黑色星期五：11 月第四個星期四的隔天。 */
export function blackFriday(year: number): Date {
  const d = new Date(Date.UTC(year, 10, 1));
  const firstThu = (4 - d.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, 10, 1 + firstThu + 21 + 1));
}

/**
 * 台灣季節／節慶（月份層級，不需要任何 API）。
 * key = 月份(1–12)。`kind` 讓趨勢訊號分辨是季節脈絡還是節慶事件。
 * 農曆檔期（春節、中秋）逐年變動，只能用月份表達。
 */
export const TAIWAN_SEASONAL: Record<number, { label: string; kind: "season" | "event"; score: number }[]> = {
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

/** 台北時間（UTC+8）的「今天」00:00，避免跨日時算錯一天。 */
export function taipeiToday(now: Date = new Date()): Date {
  const tpe = new Date(now.getTime() + 8 * 3600_000);
  return new Date(Date.UTC(tpe.getUTCFullYear(), tpe.getUTCMonth(), tpe.getUTCDate()));
}

export const dayDiff = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86400_000);

export type Occasion = { label: string; date: Date; daysUntil: number };

/**
 * 未來 `withinDays` 天內（含剛過 3 天）的檔期，依距今天數由近到遠。
 * 同時放今年與明年的日期，12 月看 1/1 才不會漏。
 */
export function upcomingPromos(now: Date = new Date(), withinDays = 45): Occasion[] {
  const today = taipeiToday(now);
  const year = today.getUTCFullYear();
  const out: Occasion[] = [];
  for (const y of [year, year + 1]) {
    for (const [m, d, label] of PROMO_FIXED) out.push({ label, date: new Date(Date.UTC(y, m - 1, d)), daysUntil: 0 });
    out.push({ label: "母親節檔", date: mothersDay(y), daysUntil: 0 });
    out.push({ label: "黑色星期五", date: blackFriday(y), daysUntil: 0 });
  }
  return out
    .map((o) => ({ ...o, daysUntil: dayDiff(today, o.date) }))
    .filter((o) => o.daysUntil >= -3 && o.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

/**
 * 「現在該講什麼」的主題關鍵字：當月季節脈絡 + 下個月（提早準備）+ 即將到來的檔期。
 * 用來判斷一篇舊內容的主題是否「又到時候了」。
 */
export function currentThemeKeywords(now: Date = new Date(), withinDays = 45): string[] {
  const today = taipeiToday(now);
  const m = today.getUTCMonth() + 1;
  const next = (m % 12) + 1;
  const labels = [
    ...(TAIWAN_SEASONAL[m] ?? []).map((s) => s.label),
    ...(TAIWAN_SEASONAL[next] ?? []).map((s) => s.label),
    ...upcomingPromos(now, withinDays).map((o) => o.label),
  ];
  // 拆成可比對的短詞：「入秋換季保養」→ 入秋 / 換季 / 保養；「88 節／父親節檔」→ 88節 / 父親節
  const parts = labels.flatMap((l) =>
    l
      .split(/[／/、,，\s]+/)
      .map((t) => t.replace(/[0-9]+\s*月?|購物節|連假檔?|檔期?|節$/g, (mm) => (mm === "節" ? "節" : mm)).trim())
      // 丟掉純數字（「9/9 購物節」會切出 "99"，那會誤中「售價 99 元」這種無關文字）
      .filter((t) => t.length >= 2 && !/^[0-9]+$/.test(t)),
  );
  return [...new Set([...labels, ...parts])];
}
