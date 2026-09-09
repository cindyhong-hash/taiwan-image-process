/**
 * 首頁「內容再利用機會」的挑選邏輯。
 *
 * 原本這張卡只是「最新完成的 3 篇」—— 跟下方「最近作品」是同一批資料，
 * 等於把同樣的東西列兩次，而且剛做完的內容翻新沒有意義。
 *
 * 改成依六項準則評分，挑出「現在最值得翻新」的舊內容：
 *   1. 時間        這篇已經一段時間沒出現（太新的直接排除）
 *   2. 季節性      去年同期做過，今年同期又適合
 *   3. 產品相關性  內容提到現在有在推的產品
 *   4. 品牌內容缺口 最近偏某一類，這篇補的是偏少的那一類
 *   5. 主題時效    主題撞上即將到來的檔期／季節（換季、開學、母親節…）
 *   6. 重複程度    最近 30–60 天做過類似主題 → 扣分
 *
 * 刻意用「確定性規則」而不是 LLM：這是首頁一進去就要顯示的小卡，
 * 多等好幾秒不值得；而且規則可測、行為可預期。
 */
import { currentThemeKeywords, taipeiToday, dayDiff } from "../calendar/tw-calendar.ts";

export type ReuseActivity = {
  id: string;
  theme: string;
  createdAt: string | Date;
  status: string;
  layoutId?: string | null;
  imagePrompt?: string | null;
  titleText?: string | null;
};

/** 內容類型（用關鍵字粗分，只為了算「最近偏哪一類」）。 */
export type ContentKind = "promo" | "knowledge" | "product" | "lifestyle" | "engagement";

const KIND_RULES: { kind: ContentKind; re: RegExp }[] = [
  { kind: "promo", re: /優惠|折|特價|限時|購物節|檔期|搶購|贈|預購|下殺|買一/ },
  { kind: "knowledge", re: /教學|怎麼|如何|知識|迷思|技巧|步驟|注意|正確|挑選|選擇|指南|攻略|懶人包|大公開/ },
  { kind: "engagement", re: /[？?]|你(們)?會|投票|留言|分享你|猜|你知道/ },
  { kind: "lifestyle", re: /日常|穿搭|旅行|居家|上班|約會|儀式|生活/ },
];

/** 判斷一篇內容偏哪一類；都不中就算產品型（最常見的預設）。 */
export function classifyKind(a: ReuseActivity): ContentKind {
  const text = [a.theme, a.titleText, a.imagePrompt].filter(Boolean).join(" ");
  for (const r of KIND_RULES) if (r.re.test(text)) return r.kind;
  return "product";
}

/** 中文沒有空白分詞，用 2-gram 算重疊度（0–1）。 */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.replace(/[\s\p{P}\p{S}]/gu, "");
    const out = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return hit / Math.min(ga.size, gb.size);
}

export type ScoredReuse = {
  activity: ReuseActivity;
  score: number;
  /** 給使用者看的一句話：為什麼推薦這篇。
   *  沒有具體訊號（只是「很久沒做了」）時刻意留空 —— 那句話對每一則都成立，
   *  三格重複同一句等於沒資訊；留空讓卡片改顯示日期，反而看得出新舊。 */
  reason?: string;
};

/** 太新的內容翻新沒有意義，直接不列入。 */
const MIN_AGE_DAYS = 30;
/** 近期是否做過類似主題的觀察窗（使用者指定 30–60 天）。 */
const DUP_WINDOW_DAYS = 60;
const DUP_THRESHOLD = 0.4;

export function pickReuseOpportunities(
  activities: ReuseActivity[],
  opts: { now?: Date; productNames?: string[]; limit?: number } = {},
): ScoredReuse[] {
  const now = opts.now ?? new Date();
  const today = taipeiToday(now);
  const limit = opts.limit ?? 3;
  const productNames = (opts.productNames ?? []).filter((n) => n && n.trim().length >= 2);
  const themeKeywords = currentThemeKeywords(now);

  const done = activities.filter((a) => a.status === "DONE" && a.layoutId !== "magic-layers" && a.theme?.trim());
  const ageOf = (a: ReuseActivity) => dayDiff(new Date(a.createdAt), today);

  // 近 60 天做過的主題（用來扣「重複程度」）。
  const recentThemes = done.filter((a) => ageOf(a) <= DUP_WINDOW_DAYS).map((a) => a.theme);

  // 近 8 篇的類型分布（用來判斷「內容缺口」）。
  const recent8 = done.slice(0, 8);
  const kindCount = new Map<ContentKind, number>();
  for (const a of recent8) kindCount.set(classifyKind(a), (kindCount.get(classifyKind(a)) ?? 0) + 1);

  const scored: ScoredReuse[] = [];
  for (const a of done) {
    const age = ageOf(a);
    if (age < MIN_AGE_DAYS) continue; // ① 太新 → 翻新沒意義

    const created = new Date(a.createdAt);
    const text = [a.theme, a.titleText, a.imagePrompt].filter(Boolean).join(" ");
    // 具體訊號（季節/產品/檔期/缺口）與「時間」分開記：
    // 時間對每個候選都成立，是最沒資訊量的理由，不該跟具體訊號競爭顯示位置。
    const signals: { pts: number; reason: string }[] = [];

    // ① 時間：越久沒出現越值得翻新，但太舊的內容本身可能已過時。
    const timePts = age > 400 ? 1 : age >= 120 ? 2 : 1;

    // ② 季節性：同月份、不同年 → 去年同期做過，今年又到了。
    const sameMonth = created.getUTCMonth() === today.getUTCMonth();
    const earlierYear = created.getUTCFullYear() < today.getUTCFullYear();
    if (sameMonth && earlierYear) {
      signals.push({ pts: 3, reason: `去年同期（${created.getUTCFullYear()}/${String(created.getUTCMonth() + 1).padStart(2, "0")}）做過` });
    } else if (Math.abs(created.getUTCMonth() - today.getUTCMonth()) === 1 && earlierYear) {
      signals.push({ pts: 1, reason: "去年相近時節做過" });
    }

    // ③ 產品相關性：內容提到現在有在推的產品。
    const hitProduct = productNames.find((n) => text.includes(n));
    if (hitProduct) signals.push({ pts: 2, reason: `和「${hitProduct}」有關` });

    // ⑤ 主題時效：撞上即將到來的檔期／季節。
    const hitTheme = themeKeywords.find((k) => k.length >= 2 && text.includes(k));
    if (hitTheme) signals.push({ pts: 2, reason: `「${hitTheme}」又要到了` });

    // ④ 內容缺口：這篇的類型在最近 8 篇裡偏少。
    const kind = classifyKind(a);
    const cnt = kindCount.get(kind) ?? 0;
    if (recent8.length >= 4 && cnt <= 1) {
      signals.push({ pts: 2, reason: `最近較少${KIND_LABEL[kind]}內容` });
    }

    // ⑥ 重複程度：近 60 天做過太像的主題 → 重扣，避免推剛講過的事。
    const dup = recentThemes.some((t) => t !== a.theme && similarity(a.theme, t) >= DUP_THRESHOLD);
    const penalty = dup ? 4 : 0;

    const score = timePts + signals.reduce((n, p) => n + p.pts, 0) - penalty;
    if (score <= 0) continue;
    const best = signals.length ? signals.reduce((m, p) => (p.pts > m.pts ? p : m), signals[0]) : null;
    scored.push({ activity: a, score, reason: best?.reason });
  }

  const ranked = scored.sort((x, y) => y.score - x.score || ageOf(y.activity) - ageOf(x.activity));

  // 多樣性：同一個理由（例如「最近較少互動內容」）連續出現三次，
  // 整張卡的資訊量等於只有一則。先各取不同理由的最高分，不夠再補。
  const picked: ScoredReuse[] = [];
  const usedReason = new Set<string>();
  for (const r of ranked) {
    if (picked.length >= limit) break;
    if (r.reason) {
      if (usedReason.has(r.reason)) continue;
      usedReason.add(r.reason);
    }
    picked.push(r);
  }
  for (const r of ranked) {
    if (picked.length >= limit) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked;
}

const KIND_LABEL: Record<ContentKind, string> = {
  promo: "促銷",
  knowledge: "知識型",
  product: "產品",
  lifestyle: "生活風格",
  engagement: "互動",
};
