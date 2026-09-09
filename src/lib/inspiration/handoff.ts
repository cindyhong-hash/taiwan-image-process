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

/**
 * 決定要用哪個多圖版型。id 取自 MULTI_LAYOUTS（src/types/multiLayout.ts）。
 * 每個張數挑一個最通用的版型當預設，使用者進去還是能自己換。
 */
const LAYOUT_BY_COUNT: Record<number, string> = {
  2: "carousel-2",
  3: "three-h-top",
  4: "four-grid",
  5: "five-top2-bottom3",
};

/** 把 brief 的各欄位組成既有表單的「畫面描述 Prompt」（imagePrompt）。
 *  只在 AI 沒給 imagePrompt 時才用：這個拼裝法會把文案方向／趨勢背景塞進
 *  「畫面描述」欄位，型別其實對不上，是不得已的退路。 */
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
  // AI 產靈感時就寫好的畫面描述優先；沒有才退回欄位拼裝。
  const imagePrompt = brief.imagePrompt?.trim() || composeImagePrompt(brief);
  const productImageUrls = brief.recommendedProduct?.imageUrl
    ? [brief.recommendedProduct.imageUrl]
    : [];

  try {
    sessionStorage.removeItem(ACTIVITY_REF_KEY);
    sessionStorage.removeItem(ACTIVITY_BASE_KEY);
    sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
    // 既有 Handoff 型別：{ clientId, imagePrompt, requiredText, imageRatio?, variantCount?, productImageUrls?, referenceImageUrls? }
    // single 讀 imagePrompt / multi 讀成 theme。
    // requiredText 會強制文字印在成品上，所以只有 AI 真的給了好句子才帶（沒把握就留空）。
    sessionStorage.setItem(
      ACTIVITY_HANDOFF_KEY,
      JSON.stringify({
        clientId: brief.clientId,
        imagePrompt,
        requiredText: brief.requiredText?.trim() ?? "",
        productImageUrls,
      }),
    );
  } catch {
    /* sessionStorage 不可用時仍導頁，只是不預填 */
  }

  const base = `/clients/${brief.clientId}/activities/new`;
  // 張數優先看 AI 的建議；沒有才退回 suggestedFormat（carousel 當 2 張）。
  const count = brief.suggestedCount ?? (brief.suggestedFormat === "carousel" ? 2 : 1);
  const layout = LAYOUT_BY_COUNT[count];
  return layout ? `${base}/multi?layout=${layout}` : base;
}
