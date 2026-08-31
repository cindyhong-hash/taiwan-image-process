// 規則偵測「再次使用舊活動」時可能需要更新的時效性內容（免 AI、即時）。
// 回傳 [{ text, reason }]，給表單上方 banner 提示使用者哪些地方八成要改。

type UpdateFlag = { text: string; reason: string };

const RULES: { reason: string; re: RegExp }[] = [
  { reason: "年份", re: /20\d{2}\s*年?/g },
  { reason: "日期", re: /\d{1,2}\s*[/／月]\s*\d{1,2}\s*[日號]?/g },
  { reason: "價格 / 優惠", re: /(?:NT\$|US\$|\$|＄)\s?\d[\d,]*|\d[\d,]*\s?(?:元|折|%|％)|第[一二三四五六七八九十兩\d]+件|買\d+送\d+/g },
  { reason: "檔期 / 季節", re: /雙(?:11|十一|12|十二)|週年慶|年中慶|黑(?:色星期)?五|母親節|父親節|情人節|中秋|端午|聖誕|新年|春節|過年|開學|夏季|冬季|春季|秋季|夏日|冬日/g },
  { reason: "時效字眼", re: /限時|限量|倒數|最後\s*\d*\s*(?:天|日|小時)?|即將(?:結束|截止)|本(?:週|月|檔)|預購|早鳥|快閃/g },
];

export function detectUpdateFlags(...texts: (string | null | undefined)[]): UpdateFlag[] {
  const joined = texts.filter(Boolean).join("\n");
  if (!joined.trim()) return [];
  const seen = new Set<string>();
  const out: UpdateFlag[] = [];
  for (const { reason, re } of RULES) {
    const matches = joined.match(re);
    if (!matches) continue;
    for (const m of matches) {
      const key = m.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ text: key, reason });
      if (out.length >= 6) return out; // 最多列 6 項，避免太吵
    }
  }
  return out;
}
