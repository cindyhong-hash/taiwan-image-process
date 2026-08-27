// 下載檔名共用邏輯——確保所有生成類型（產品圖／活動圖／素材圖／多圖）下載出嚟嘅
// 檔名格式一致：{品牌名}-{類型}-{寬x高}-{可讀標題（截斷、去除非法字元）}.{副檔名}，
// 缺邊一截就跳過（唔會留低多餘 "-"），唔會再出返時間戳+random 嗰種亂碼檔名。
export function sanitizeFilenamePart(text: string, maxLen = 24): string {
  return text.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

// 品牌名特登拎晒空格（例："Lady's Talk" → "LadysTalk"），避免同段與段之間嘅 "-" 撞埋一齊睇唔清界線。
export function sanitizeBrandPart(text: string, maxLen = 20): string {
  return text.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "").slice(0, maxLen);
}

export function extFromUrl(url: string, fallback = "jpg"): string {
  return (url.split(".").pop() || fallback).split("?")[0].slice(0, 5);
}

export function buildDownloadFilename(opts: {
  url: string;
  label: string;               // 類型（產品成圖/背景素材/人像/插畫/活動圖版型/多圖01…）
  readableText?: string | null; // 可讀標題（主題/文案）
  brand?: string | null;        // 品牌名
  size?: string | null;         // 寬x高，例："1200x1200"
}): string {
  const { url, label, readableText, brand, size } = opts;
  const ext = extFromUrl(url);
  const parts = [
    brand ? sanitizeBrandPart(brand) : "",
    label,
    size || "",
    readableText ? sanitizeFilenamePart(readableText) : "",
  ].filter(Boolean);
  return `${parts.join("-")}.${ext}`;
}
