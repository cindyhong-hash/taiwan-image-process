import { NextResponse } from "next/server";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export async function POST(request: Request) {
  try {
    const { prompt, instruction } = await request.json();
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });
    }

    // 有 instruction → 指令式修改模式；無 → 原本的擴寫優化模式
    const systemContent = instruction
      ? "你是一位專業的 AI 廣告視覺導演。用戶會提供現有的畫面描述 Prompt，以及一個修改指令。請根據指令修改 Prompt，保留原有的核心內容，只調整用戶指定的部分。請直接輸出修改後的完整提示詞，不要包含任何解釋、引號或寒暄。"
      : "你是一位專業的 AI 廣告視覺導演與創意大師。用戶會輸入簡單的畫面描述，請幫他擴寫成高畫質、細節豐富、富有商業質感的 AI 繪圖提示詞（Prompt）。請自動加入適當的光影、鏡頭質感、構圖細節。請直接輸出優化後的提示詞內容，不要包含任何解釋、引號或寒暄。";

    const userContent = instruction
      ? `現有 Prompt：\n${prompt}\n\n修改指令：${instruction}`
      : prompt;

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://marketing-tool.local",
        "X-Title": "Marketing Tool",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        max_tokens: 500,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return NextResponse.json(
        { error: data.error?.message ?? `OpenRouter error ${res.status}` },
        { status: 500 }
      );
    }

    const optimized = data.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ optimizedPrompt: optimized });
  } catch (err) {
    console.error("[optimize-prompt]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
