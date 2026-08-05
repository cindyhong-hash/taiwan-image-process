import { NextResponse } from "next/server";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export async function POST(request: Request) {
  try {
    const { prompt, instruction, restrained } = await request.json();
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });
    }

    // restrained=true：只用喺「gallery 圖做底圖」（底圖模式）——克制版，同素材庫
    // translateBriefToEnglishPrompt 一致嘅原則：只放大原意、保留具體元素、
    // 唔虛構通用攝影術語、輸出精簡單段。
    // restrained 冇傳 / false：從 0 開始嘅活動圖生成（普通模式）——維持原本
    // 冗長、自動加光影/鏡頭/構圖細節嘅版本，唔改動呢類活動嘅行為。
    const RESTRAINT =
      "嚴格保留用戶原有畫面裡的每個具體元素（主體、動作、場景、色彩、氛圍），" +
      "不可虛構原文沒有提及的細節 —— 尤其不要自行加入相機型號、光圈、焦段、" +
      "打光配置、構圖法則（rule of thirds 等）這類通用攝影術語，除非用戶本身有寫。" +
      "輸出必須精簡，控制在 2-3 句、一段文字內，不要分段、不要用『Lighting:』" +
      "『Composition:』這類標題列點。";
    const systemContent = instruction
      ? `你是一位專業的 AI 廣告視覺導演。用戶會提供現有的畫面描述 Prompt，以及一個修改指令。請根據指令修改 Prompt，保留原有的核心內容，只調整用戶指定的部分。${restrained ? RESTRAINT : ""}請直接輸出修改後的完整提示詞，不要包含任何解釋、引號或寒暄。`
      : restrained
      ? `你是一位精準的廣告視覺提示詞編輯。用戶會輸入簡單的畫面描述，請把它適度潤色、更具體生動。${RESTRAINT}請直接輸出優化後的提示詞內容，不要包含任何解釋、引號或寒暄。`
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
        max_tokens: restrained ? 220 : 500,
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
