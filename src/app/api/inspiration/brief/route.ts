/**
 * 靈感 → 建立圖文的「即時 brief」。
 *
 * 為什麼要單獨一支：原本 /api/inspiration 會替 11 則（3 機會 + 8 推薦）每一則
 * 都先寫好 40–80 字的畫面描述與必放文字，但使用者最多只會點其中一則，
 * 其餘 10 則全是白算的 —— 實測讓那支 API 的 LLM 時間慢了一倍以上。
 * 改成點「用這個做貼文」時，只針對那一則生成（約 2 秒）。
 *
 * 失敗不阻斷：回 {} 讓呼叫端退回既有的欄位拼裝法，使用者照樣進得了表單。
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatTextOpenRouter } from "@/lib/openrouter";

export const maxDuration = 30;

function extractJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 擋掉模型偷懶回標籤格式或太短的情況 —— 與 /api/inspiration 的把關一致。 */
const cleanImagePrompt = (raw: unknown): string | undefined => {
  const t = String(raw ?? "").trim();
  return t.length >= 10 && !t.includes("【") ? t : undefined;
};
/** 必放文字會強制印在成品上，寧缺勿濫：太長或空白就當作沒有。 */
const cleanRequiredText = (raw: unknown): string | undefined => {
  const t = String(raw ?? "").trim();
  return t && t.length <= 20 ? t : undefined;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientId = String(body.clientId ?? "");
  const topic = String(body.topic ?? "").trim();
  if (!clientId || !topic) return NextResponse.json({ error: "clientId and topic required" }, { status: 400 });

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { name: true, description: true, industry: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const ctxLines = [
    `品牌：「${client.name}」${client.industry ? `（${client.industry}）` : ""}`,
    client.description ? `品牌簡介：${client.description}` : "",
    `這次要做的主題：「${topic}」`,
    body.copyDirection ? `文案方向：${String(body.copyDirection)}` : "",
    body.visualDirection ? `畫面方向：${String(body.visualDirection)}` : "",
    body.trendContext ? `為何現在：${String(body.trendContext)}` : "",
    body.productLabel ? `要帶入的產品：${String(body.productLabel)}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `你是這個品牌的社群視覺企劃。使用者要用下面這個主題生成貼文圖，請幫他把表單填好。
${ctxLines}

只回傳 JSON：{"imagePrompt":"...","requiredText":"..."}

- imagePrompt：一段用日常語言寫的「畫面」描述，講清楚場景、主體、光線氛圍、構圖，40–80 字。
  只描述看得見的東西。不要寫文案方向、不要寫行銷目的、不要用「【】」標籤、不要重複標題。
- requiredText：建議直接印在圖上的短標語，最多 20 字。
  這會強制文字出現在成品上，所以「沒有好句子就給空字串」——寧可留空讓使用者自己填。`;

  const parsed = extractJsonObject(await chatTextOpenRouter(prompt, 400));
  return NextResponse.json({
    imagePrompt: cleanImagePrompt(parsed?.imagePrompt),
    requiredText: cleanRequiredText(parsed?.requiredText),
  });
}
