import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

/**
 * 把一個活動核心主題，拆解成 N 格分鏡。
 * 每格回傳：description（畫面描述）+ mustText（必放文字，可空）。
 * 第 1 格為主視覺、最後一格為結尾畫面。
 */
export async function POST(request: Request) {
  try {
    const { theme, count } = await request.json();
    if (!theme?.trim()) {
      return NextResponse.json({ error: "theme is required" }, { status: 400 });
    }
    const n = Math.max(1, Math.min(Number(count) || 1, 9));

    const layoutLogicMap: Record<number, string> = {
      2: `- 圖1（封面）：最強 Hook，點出痛點或情境共鳴\n- 圖2（收尾）：產品功效 + 行動呼籲`,
      3: `- 圖1（封面）：吸睛主標題，情境帶入\n- 圖2（產品）：商品名稱與核心賣點\n- 圖3（收尾）：使用體感 + 行動呼籲`,
      4: `- 圖1（封面）：情境帶入，點出痛點\n- 圖2（產品）：帶出商品名稱與外觀\n- 圖3（體驗）：強調使用體感與功效\n- 圖4（收尾）：引導留言或下單，可帶限時優惠`,
      5: `- 圖1（主封面）：最震撼情境大標\n- 圖2（產品）：外觀與第一印象\n- 圖3（特點A）：第一個優勢\n- 圖4（特點B）：第二個優勢\n- 圖5（封底）：引導留言或下單`,
    };
    const layoutLogic = layoutLogicMap[n] ?? layoutLogicMap[4];

    const prompt = `你是精通 Facebook／Instagram 社群經營的資深電商文案小編。擅長用帶點精緻生活感、口語且抓焦慮痛點的語氣，吸引滑動動態牆的受眾停下點閱。

【活動核心主題】${theme}

【多圖敘事邏輯】
${layoutLogic}

【文案規則】
- 每格文案（mustText）控制在 10-20 字，精簡有力，適合直接排版在圖片上
- 語氣自然口語，可善用 Emoji，禁止機器人語氣
- 每格文案主張必須不同，嚴禁重複——第1格和最後1格不可相同
- 第1格是最強 Hook，讓人想繼續滑
- 畫面描述要具體：場景 + 人物動作 + 產品出現方式（30-50字）

【輸出格式】嚴格只輸出 JSON 陣列：
[{"description":"...","mustText":"..."}]
共 ${n} 個物件。`;

    const res = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (res.content[0] as { text: string }).text.trim();
    // 容錯：抓出第一個 [ ... ] JSON 陣列
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ error: "AI 回傳格式無法解析", raw }, { status: 502 });
    }
    let cells: { description: string; mustText: string }[];
    try {
      cells = JSON.parse(match[0]);
    } catch {
      return NextResponse.json({ error: "AI 回傳 JSON 解析失敗", raw }, { status: 502 });
    }

    // 正規化：補滿 n 格、欄位防呆
    const normalized = Array.from({ length: n }, (_, i) => ({
      description: cells[i]?.description?.trim() ?? "",
      mustText: cells[i]?.mustText?.trim() ?? "",
    }));

    return NextResponse.json({ cells: normalized });
  } catch (err) {
    console.error("[POST /api/ai/storyboard]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
