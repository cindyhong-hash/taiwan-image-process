import type { LayoutConfig } from "@/types";

type CopyPromptParams = {
  theme: string;
  focusPoint: string;
  toneLabels: string[];
  layoutType: string;
  taboos: string[];
};

const TONE_MAP: Record<string, string> = {
  A: "清晰直接，符合品牌標準",
  B: "文青風格，視覺感強，有品味",
  C: "衝動購買感，社群爆點，有氣勢",
};

export function buildCopyPrompt(params: CopyPromptParams): string {
  const { theme, focusPoint, toneLabels, layoutType, taboos } = params;
  return `你是一位資深社群媒體文案師。
活動主題：${theme}
訴求重點：${focusPoint}
品牌調性：${toneLabels.join("、") || "標準"}
版型方向：${TONE_MAP[layoutType] || "標準風格"}
禁忌事項：${taboos.length > 0 ? taboos.join("、") : "無"}

請寫一段適合 Facebook/Instagram 貼文的文案，包含：
1. 主標題（10字以內）
2. 副標題或說明文字（20-30字）
3. Call-to-action（5字以內）

只回傳文案內容，不要加解釋。格式：
主標題：...
副標題：...
CTA：...`;
}
