import { chatTextOpenRouter } from "@/lib/openrouter";
import type { CreativeBrief } from "@/lib/planner/content-brief";

export type CreativeBriefInput = {
  format: "SINGLE" | "CAROUSEL";
  topic: string;
  contentDirection: string;
  campaignName: string;
  campaignDescription: string;
  productLabels: string[];
  brandName: string;
  brandDescription?: string | null;
  industry?: string | null;
  platforms: string[];
  productDesc?: string | null;   // 由產品實圖分析出的客觀描述（Claude Vision），防止畫面誤解產品類型
};

function parse(text: string | null): unknown {
  if (!text) return null;
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { return null; }
}

/**
 * handoff 時先幫使用者把「一則貼文」想好整份創意 brief：
 * 單圖 → 主標/副標/畫面描述；多圖 → 另含逐頁拆解。之後預填進編輯器，使用者只需微調。
 * 任何失敗回 {}，呼叫端會退回用主題/內容方向，不阻斷製作。
 */
export async function generateCreativeBrief(input: CreativeBriefInput): Promise<CreativeBrief> {
  const facts = [
    `品牌：${input.brandName}`,
    input.brandDescription?.trim() && `品牌簡介：${input.brandDescription.trim()}`,
    input.industry?.trim() && `產業：${input.industry.trim()}`,
    `主題：${input.topic}`,
    input.contentDirection.trim() && `內容方向：${input.contentDirection.trim()}`,
    input.campaignName && `Campaign：${input.campaignName}${input.campaignDescription.trim() ? `（${input.campaignDescription.trim()}）` : ""}`,
    input.productLabels.length && `關聯產品：${input.productLabels.join("、")}`,
    input.productDesc?.trim() && `產品實圖分析（客觀事實，畫面務必符合）：${input.productDesc.trim()}`,
    input.platforms.length && `平台：${input.platforms.join("、")}`,
  ].filter(Boolean).join("\n");

  const shape = input.format === "CAROUSEL"
    ? `{"headline":"封面主標(≤14字)","subtitle":"封面副標(≤24字,可空)","slides":[{"text":"這頁圖上文字(短)","visual":"這頁畫面描述:主體/構圖/氛圍"}]} 。slides 給 3-5 頁,第一頁為封面。`
    : `{"headline":"圖上主標(≤14字)","subtitle":"圖上副標(≤24字,可空)","visual":"畫面描述:場景/主體/構圖/氛圍,一段話"}`;

  const prompt = `你是台灣社群視覺企劃。根據以下資訊，為「一則${input.format === "CAROUSEL" ? "多圖(Carousel)" : "單圖"}貼文」規劃內容，讓設計師可直接製圖。\n${facts}\n\n規則：畫面描述要具體、扣住實際產品與主題；若有「產品實圖分析」，畫面中的產品外觀與用途一律以它為準，不可自行改成別種類別的物品或情境（例如產品是刀具就別畫成料理食材、是保養品就別畫成食物）；不得虛構未提供的產品功能，資訊不足就寫品牌通用畫面；文字精簡、繁體中文。\n只回傳 JSON：${shape}`;

  const parsed = parse(await chatTextOpenRouter(prompt, 900));
  if (!parsed || typeof parsed !== "object") return {};
  const p = parsed as Record<string, unknown>;
  const brief: CreativeBrief = {
    headline: typeof p.headline === "string" ? p.headline.trim() : undefined,
    subtitle: typeof p.subtitle === "string" ? p.subtitle.trim() : undefined,
    visual: typeof p.visual === "string" ? p.visual.trim() : undefined,
  };
  if (input.format === "CAROUSEL" && Array.isArray(p.slides)) {
    brief.slides = p.slides
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => ({ text: typeof s.text === "string" ? s.text.trim() : "", visual: typeof s.visual === "string" ? s.visual.trim() : "" }))
      .filter((s) => s.text || s.visual)
      .slice(0, 6);
  }
  return brief;
}
