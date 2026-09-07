/**
 * 靈感中心 →（既有）建立圖文的唯一接點。
 * 不新建 Generator：把一則 InspirationBrief 寫進既有的 sessionStorage handoff（ACTIVITY_HANDOFF_KEY），
 * 再回傳要導去的既有路由。single → /activities/new；carousel → /activities/new/multi?layout=carousel-2。
 * 既有的 new / new/multi 頁會在 mount 時讀走 handoff（且 gated on clientId），故此處零改動即可接上。
 */
import {
  ACTIVITY_HANDOFF_KEY,
  ACTIVITY_REF_KEY,
  ACTIVITY_BASE_KEY,
  ACTIVITY_IMAGE_PROMPT_KEY,
} from "@/components/activities/RolePickerModal";
import type { InspirationBrief } from "./types";

/** 把 brief 的各欄位組成既有表單的「畫面描述 Prompt」（imagePrompt）。 */
export function composeImagePrompt(brief: InspirationBrief): string {
  const lines: string[] = [brief.topic.trim()];
  if (brief.copyDirection?.trim()) lines.push(`【文案方向】${brief.copyDirection.trim()}`);
  if (brief.visualDirection?.trim()) lines.push(`【畫面方向】${brief.visualDirection.trim()}`);
  if (brief.recommendedProduct?.label) lines.push(`【帶入產品】${brief.recommendedProduct.label}`);
  if (brief.trendContext?.trim()) lines.push(`【趨勢背景】${brief.trendContext.trim()}`);
  return lines.filter(Boolean).join("\n");
}

/**
 * 寫入 handoff 並回傳目標路由。呼叫端：`router.push(startPostFromBrief(brief))`。
 * 注意：先清掉其他單張帶入 key，避免與 handoff 衝突。
 */
export function startPostFromBrief(brief: InspirationBrief): string {
  const imagePrompt = composeImagePrompt(brief);
  const productImageUrls = brief.recommendedProduct?.imageUrl
    ? [brief.recommendedProduct.imageUrl]
    : [];

  try {
    sessionStorage.removeItem(ACTIVITY_REF_KEY);
    sessionStorage.removeItem(ACTIVITY_BASE_KEY);
    sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
    // 既有 Handoff 型別：{ clientId, imagePrompt, requiredText, imageRatio?, variantCount?, productImageUrls?, referenceImageUrls? }
    // single 讀 imagePrompt / multi 讀成 theme；requiredText 留空（靈感不強制必放文字）。
    sessionStorage.setItem(
      ACTIVITY_HANDOFF_KEY,
      JSON.stringify({
        clientId: brief.clientId,
        imagePrompt,
        requiredText: "",
        productImageUrls,
      }),
    );
  } catch {
    /* sessionStorage 不可用時仍導頁，只是不預填 */
  }

  const base = `/clients/${brief.clientId}/activities/new`;
  return brief.suggestedFormat === "carousel" ? `${base}/multi?layout=carousel-2` : base;
}
