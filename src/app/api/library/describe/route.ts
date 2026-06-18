import { NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_VISION_MODEL ?? "openai/gpt-5.4-nano";

/**
 * POST /api/library/describe  { imageUrl }
 * Vision-describes an uploaded product image into a short Traditional-Chinese
 * subject phrase, used to fill the composer's 主體物件.
 */
export async function POST(request: Request) {
  try {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === "your-openrouter-api-key-here") {
      return NextResponse.json({ error: "OPENROUTER_API_KEY 尚未設定" }, { status: 500 });
    }
    const { imageUrl, kind, genType } = await request.json();
    if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    const isBackground = kind === "background";
    // "brief" = 素材生成用的簡潔生成描述（50–80 字，有創意空間供 AI 和用戶之後修改）
    const isBrief = kind === "brief";
    const genTypeLabels: Record<string, string> = {
      person: "真人寫實人像", illustration: "2D 插畫風格", background: "純背景場景",
    };
    const genTypeLabel = genTypeLabels[genType ?? ""] ?? "素材";

    const host = new URL(request.url).origin;
    const absoluteUrl = imageUrl.startsWith("http") ? imageUrl : `${host}${imageUrl}`;
    const imgRes = await fetch(absoluteUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) throw new Error(`無法載入圖片：${imgRes.status}`);
    const base64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
    const mediaType = imgRes.headers.get("content-type") ?? "image/png";

    const briefPrompt = `只回 JSON：{"zh":"看這張圖，用繁體中文（台灣用語）寫一句簡短的${genTypeLabel}生成描述，20–30字，只說主要視覺元素、色調、氛圍，不要多餘修飾。"}`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": host,
        "X-Title": "Marketing Tool",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 160,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
              {
                type: "text",
                text: isBrief ? briefPrompt
                  : isBackground
                  ? `只回 JSON：{"zh":"用繁體中文（台灣用語）描述這個背景場景/質感，20字內","en":"a concise English background prompt for AI image generation"}`
                  : `只回 JSON：{"zh":"用繁體中文（台灣用語）描述這張圖的主體物件，20字內","en":"a concise English subject prompt for AI image generation"}`,
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`OpenRouter 錯誤 ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content ?? "").trim();
    const m = raw.match(/\{[\s\S]*\}/);
    let zh = raw, en = "";
    if (m) {
      try { const j = JSON.parse(m[0]); zh = (j.zh ?? "").trim(); en = (j.en ?? "").trim(); } catch { /* fallback to raw */ }
    }
    zh = zh.replace(/^["「『]|["」』]$/g, "");
    return NextResponse.json({ subject: zh, text: zh, prompt: en });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[describe] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
