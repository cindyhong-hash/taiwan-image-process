import { NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// gemini-2.0-flash-001 已從 OpenRouter 下架(404) → 改用可用的 2.5-flash（與 analyze-image/optimize-prompt 一致）
const OPENROUTER_MODEL = process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.5-flash";

export async function POST(request: Request) {
  try {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === "your-openrouter-api-key-here") {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY 尚未設定，請在 .env.local 填入真實的 key" },
        { status: 500 }
      );
    }

    const { imageUrl } = await request.json();
    if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });

    // Convert relative URL to absolute for fetch
    const host = new URL(request.url).origin;
    const absoluteUrl = imageUrl.startsWith("http") ? imageUrl : `${host}${imageUrl}`;

    // Fetch image and convert to base64
    const imgRes = await fetch(absoluteUrl);
    if (!imgRes.ok) throw new Error(`無法載入圖片：${imgRes.status}`);
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mediaType = imgRes.headers.get("content-type") ?? "image/jpeg";

    // Call OpenRouter (OpenAI-compatible format)
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": host,
        "X-Title": "Marketing Tool",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mediaType};base64,${base64}`,
                },
              },
              {
                type: "text",
                text: `你是一位專業視覺設計師與品牌策略師。請**據實**分析這張圖片（不要套用通用答案），以 JSON 格式回傳四個面向。

【據實判讀】
- 構圖要描述「畫面實際版面」（主體位置、人物/產品/文字區的相對位置），不要一律寫「產品居中特寫」。若畫面沒有產品，就不要提產品。
- 配色 primaryColor 必須是「畫面實際最主導的顏色」，包含搶眼的品牌色/標題色（如大面積的紅、綠、金），不要慣性回灰白或米色。

【語言規定】所有欄位（name、description、toneLabels、aiPromptText）一律「繁體中文（台灣用語）」，不可簡體或英文。

【字數硬性上限｜超過視為錯誤】
- name ≤ 12 字；description ≤ 20 字。
- 每個 aiPromptText 只能「一句、不換行、不分段、不條列」：構圖 ≤ 30 字，配色/語氣/背景 ≤ 20 字。
- 嚴禁寫成段落或多句說明文。

只回傳 JSON，不要任何額外文字。
（colorScheme.extraColors：除主色、輔色外的重要點綴/中性色，0–3 個 hex；無則回 []）

{
  "composition": { "name": "構圖風格名稱(≤12字)", "description": "構圖特色(≤20字)", "aiPromptText": "一句構圖描述(≤30字)" },
  "colorScheme": { "name": "配色名稱(≤12字)", "primaryColor": "#XXXXXX", "secondaryColor": "#XXXXXX", "extraColors": ["#XXXXXX"], "aiPromptText": "一句配色描述(≤20字)" },
  "copyTone": { "name": "語氣名稱(≤12字)", "toneLabels": ["標籤1", "標籤2", "標籤3"], "aiPromptText": "一句語氣描述(≤20字)" },
  "background": { "name": "背景名稱(≤12字)", "description": "背景特色(≤20字)", "aiPromptText": "一句背景描述(≤20字)" }
}`,
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter 錯誤 ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "";

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI 回應解析失敗", raw }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
