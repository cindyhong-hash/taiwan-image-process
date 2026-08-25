import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * 依品牌設定產生貼文「選題靈感」。
 * 吃 clientId → 撈品牌（名稱／語調／常放文字／禁忌／過往貼文數）做 grounding，
 * 回傳 5 個選題 [{ title, desc }]，讓使用者一點就填入主題／畫面描述，不用手打。
 * 沿用 optimize-prompt 的 OpenRouter（gemini-2.5-flash）模式，自帶容錯 JSON 解析。
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function safeParseStringArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const { clientId, mode, avoid } = await request.json();
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });
    }

    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return NextResponse.json({ error: "找不到品牌" }, { status: 404 });
    }

    const tones = safeParseStringArray(client.toneLabels);
    const taboos = safeParseStringArray(client.taboos);
    const pastCount = safeParseStringArray(client.pastPostImageUrls).length;

    const brandLines = [
      `品牌名稱：${client.name}`,
      tones.length ? `品牌語調：${tones.join("、")}` : "",
      client.commonText?.trim() ? `常用訴求／常放文字：${client.commonText.trim()}` : "",
      taboos.length ? `禁忌（絕對避免的字詞與題材）：${taboos.join("、")}` : "",
      pastCount ? `此品牌已累積 ${pastCount} 篇過往貼文，風格請延續它們的調性。` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const avoidLine =
      Array.isArray(avoid) && avoid.length
        ? `\n\n請避免與以下已提供過的選題重複：${avoid.slice(0, 12).join("、")}`
        : "";

    const modeHint =
      mode === "theme"
        ? "這些選題會用於「多圖活動的核心主題」，title 要能撐起一整組貼文的敘事。"
        : "這些選題會用於「單張活動圖」，desc 要是能直接拿去生成的具體畫面。";

    const system = `你是資深社群企劃，擅長替美容／保養／個護／電商品牌想出「一看就想點」的社群貼文選題。${modeHint}
規則：
- 貼合品牌語調，嚴格避開所有禁忌詞與禁忌題材。
- title＝選題主題，8–16 字，具體、有記憶點，不要空泛口號。
- desc＝畫面描述，20–40 字，寫清楚場景＋人物動作＋產品出現方式，能直接當生成 prompt。
- 5 個選題方向要彼此不同（情境／痛點／功效／促銷／教學 至少涵蓋數種），不要重複。
只輸出 JSON 陣列，格式：[{"title":"...","desc":"..."}]，共 5 個，不要任何說明或前後綴。`;

    const user = `品牌資料：\n${brandLines || "（無額外設定，請用通用的美容／保養社群方向）"}${avoidLine}`;

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
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 800,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return NextResponse.json(
        { error: data.error?.message ?? `OpenRouter error ${res.status}` },
        { status: 500 }
      );
    }

    const raw = (data.choices?.[0]?.message?.content ?? "").trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ error: "AI 回傳格式無法解析", raw }, { status: 502 });
    }

    let ideas: { title: string; desc: string }[];
    try {
      const parsed = JSON.parse(match[0]);
      ideas = (Array.isArray(parsed) ? parsed : [])
        .map((x) => ({
          title: String(x?.title ?? "").trim(),
          desc: String(x?.desc ?? "").trim(),
        }))
        .filter((x) => x.title || x.desc)
        .slice(0, 6);
    } catch {
      return NextResponse.json({ error: "AI 回傳 JSON 解析失敗", raw }, { status: 502 });
    }

    if (!ideas.length) {
      return NextResponse.json({ error: "沒有產生選題，請再試一次" }, { status: 502 });
    }

    return NextResponse.json({ ideas });
  } catch (err) {
    console.error("[POST /api/ai/inspire]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
