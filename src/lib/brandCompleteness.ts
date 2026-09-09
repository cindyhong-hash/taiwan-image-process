/**
 * 品牌設定完成度（單一來源）。
 *
 * 為什麼要收斂成一支：首頁與品牌設定頁顯示的是同一張「AI 已學習」卡，
 * 但兩邊原本各自算 —— 首頁六項、設定頁另一套就地寫死的八項，
 * 同一個品牌會顯示 83% 與 75% 兩個數字，「品牌素材」的定義也不同
 * （首頁算素材庫圖片、設定頁算過往貼文圖）。使用者無法信任任何一個。
 *
 * 納入的項目刻意只挑「真的會影響 AI 產出」的：
 *   - 品牌簡介／語氣／禁忌詞：直接寫進文案與靈感的 prompt
 *   - 主色：生圖與版型配色
 *   - Logo／過往貼文／素材庫圖片：視覺學習來源
 * 品牌名稱不算（建立時就必填，算它只會虛胖分數）；
 * 常用字體也不算（目前不進 prompt，對產出影響有限）。
 */
export type CompletenessInput = {
  /** 品牌簡介。原本沒算，但它是文案與靈感最依賴的欄位，漏算會讓分數虛高。 */
  description?: string | null;
  primaryColor?: string | null;
  toneLabels?: string[] | null;
  taboos?: string[] | null;
  logoUrls?: unknown[] | null;
  pastPostUrls?: unknown[] | null;
  /** 素材庫圖片數（兩頁都用同一個定義）。 */
  assetCount: number;
};

export type CompletenessResult = {
  percent: number;
  assetCount: number;
  /** 還沒填的項目名稱，直接拿去畫面上顯示「還缺什麼」。 */
  missing: string[];
};

export function brandCompleteness(i: CompletenessInput): CompletenessResult {
  const checks: { label: string; ok: boolean }[] = [
    { label: "品牌簡介", ok: !!i.description?.trim() },
    { label: "品牌主色", ok: !!i.primaryColor },
    { label: "品牌語氣", ok: (i.toneLabels?.length ?? 0) > 0 },
    { label: "禁忌詞", ok: (i.taboos?.length ?? 0) > 0 },
    { label: "Logo", ok: (i.logoUrls?.length ?? 0) > 0 },
    { label: "過往貼文參考", ok: (i.pastPostUrls?.length ?? 0) > 0 },
    { label: "素材庫圖片", ok: i.assetCount > 0 },
  ];
  const percent = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  return { percent, assetCount: i.assetCount, missing: checks.filter((c) => !c.ok).map((c) => c.label) };
}
