import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { contentTypeForExt } from "@/lib/storage";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

async function toBase64DataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:")) return imageUrl;

  if (imageUrl.startsWith("/")) {
    const buf = await readFile(join(process.cwd(), "public", imageUrl));
    const ext = imageUrl.split(".").pop() ?? "jpeg";
    const mime = contentTypeForExt(ext);
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  const res = await fetch(imageUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") ?? "image/jpeg";
  return `data:${ct};base64,${buf.toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json();
    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });
    }

    const dataUrl = await toBase64DataUrl(imageUrl);

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
          {
            role: "system",
            content:
              "你是一位 AI 繪圖提示詞逆向工程師。請仔細分析用戶提供的這張參考圖，並用詳細的文字描述它的：構圖、色彩調性、光影方向、藝術風格與整體氛圍。請直接輸出適合 AI 繪圖（如 Flux 模型）的結構化提示詞，不要包含任何寒暄或解釋。",
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: "請分析這張圖的風格並輸出 AI 繪圖提示詞。" },
            ],
          },
        ],
        max_tokens: 400,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return NextResponse.json(
        { error: data.error?.message ?? `OpenRouter error ${res.status}` },
        { status: 500 }
      );
    }

    const styleDescription = data.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ styleDescription });
  } catch (err) {
    console.error("[analyze-image]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
