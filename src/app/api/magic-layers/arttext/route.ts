/* ============================================================
   POST /api/magic-layers/arttext
   AI 特效字：把一段文字生成成藝術字圖（立體/漸層/書法…）。
   作法：純白底 → Gemini 只畫「隔離的藝術字」→ 去背成透明 PNG → 疊在版面上。
   Body: { text, subtitle?, width?, height?, style?, brandTones? }
   Returns: { url, transparent } | { error }
   需要 OPENROUTER_API_KEY（生字）＋ FAL_KEY（去背，選用；失敗退回不透明）。
   ============================================================ */
import { NextResponse } from "next/server";
import { removeBackground } from "@/lib/fal";
import { loadBuffer, saveBuffer } from "@/lib/storage";
import sharp from "sharp";

export const maxDuration = 120;

const OR = "https://openrouter.ai/api/v1/chat/completions";
const IMG_MODEL = "google/gemini-3-pro-image-preview";

/** 直接叫 Gemini 圖片編輯：喺底圖上照 prompt 畫，回 Buffer（png）。 */
async function geminiRender(dataUrl: string, prompt: string): Promise<Buffer | null> {
  const res = await fetch(OR, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: IMG_MODEL,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }],
      modalities: ["image", "text"],
    }),
  });
  const data = await res.json();
  const out: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!out) { console.warn("[arttext] 冇圖:", JSON.stringify(data?.error ?? {}).slice(0, 200)); return null; }
  const raw = out.startsWith("data:")
    ? Buffer.from(out.split(",")[1], "base64")
    : Buffer.from(await (await fetch(out)).arrayBuffer());
  return await sharp(raw).png().toBuffer();
}

const STYLE_HINTS: Record<string, string> = {
  gradient: "bold rounded sans-serif letters filled with a smooth vibrant colour gradient, subtle soft drop shadow",
  "3d": "glossy extruded 3D lettering with depth and highlights, playful and eye-catching",
  calligraphy: "elegant flowing brush calligraphy strokes with organic thick-and-thin contrast",
  neon: "glowing neon-tube lettering with a soft luminous halo",
  gold: "luxurious metallic gold lettering with shiny reflective highlights",
  cute: "chunky bubbly rounded letters with a cheerful playful colour palette",
};

export async function POST(request: Request) {
  try {
    if (!process.env.OPENROUTER_API_KEY) return NextResponse.json({ error: "缺少 OPENROUTER_API_KEY（生成特效字需要）" }, { status: 400 });
    const { text, subtitle, width, height, style, brandTones } = await request.json();
    if (!text || !String(text).trim()) return NextResponse.json({ error: "缺少文字" }, { status: 400 });

    // 生成尺寸：夾在 768–1280、保留圖層框長寬比（太小 Gemini 畫唔清楚）
    const boxW = Math.round(width) > 0 ? Math.round(width) : 1008;
    const boxH = Math.round(height) > 0 ? Math.round(height) : 256;
    const genW = Math.min(1280, Math.max(768, boxW));
    const genH = Math.min(1280, Math.max(320, Math.round(genW * (boxH / boxW))));

    // 純白底 → 只喺白底上畫藝術字，方便之後去背
    const whiteBuf = await sharp({ create: { width: genW, height: genH, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const baseUrl = `data:image/png;base64,${whiteBuf.toString("base64")}`;

    const styleHint = STYLE_HINTS[String(style)] || STYLE_HINTS.gradient;
    const toneHint = Array.isArray(brandTones) && brandTones.length ? ` Prefer these brand colours: ${brandTones.slice(0, 3).join(", ")}.` : "";
    const subLine = subtitle && String(subtitle).trim() ? ` Below it, in a much smaller matching style, render the subtitle text "${String(subtitle).trim()}".` : "";

    const prompt =
      `Render ONLY the following text as a single piece of decorative artistic typography (word art / 藝術字), centered and filling most of the frame: "${String(text).trim()}".${subLine} ` +
      `Style: ${styleHint}.${toneHint} ` +
      `CRITICAL RULES: pure flat solid WHITE (#FFFFFF) background, absolutely nothing else in the image — no product, no photo, no scene, no people, no objects, no borders, no frame, no decorative background patterns. ` +
      `Keep the exact characters and spelling of the text unchanged (it may be Traditional Chinese). Make the lettering large, clean, high-contrast and well-readable. Just the stylized text on white.`;

    const genBuf = await geminiRender(baseUrl, prompt);
    if (!genBuf) return NextResponse.json({ error: "特效字生成失敗，請重試" }, { status: 500 });
    const genUrl = await saveBuffer(genBuf, "png", "ml-arttext-src-");

    // 去背成透明（BiRefNet）→ 乾淨疊喺版面背景上。失敗就退回不透明整張。
    if (process.env.FAL_KEY) {
      try {
        const buf = await loadBuffer(genUrl);
        const dataUrl = `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
        const cut = await removeBackground(dataUrl);
        if (cut) {
          const url = await saveBuffer(Buffer.from(cut), "png", "ml-arttext-");
          return NextResponse.json({ url, transparent: true });
        }
      } catch { /* 去背失敗 → 用不透明版 */ }
    }
    return NextResponse.json({ url: genUrl, transparent: false });
  } catch (err) {
    console.error("[magic-layers/arttext] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
