/* ============================================================
   POST /api/magic-layers/arttext
   AI 特效字：把一段文字生成成藝術字圖（立體/漸層/書法…）。
   作法：純白底 → Gemini 只畫「隔離的藝術字」→ 去背成透明 PNG → 疊在版面上。
   有參考圖時：先用視覺模型「只描述風格（不讀內容文字）」→ 再拿描述去生字，
   圖像模型完全睇唔到參考圖，避免抄到參考圖上原本嘅字。
   Body: { text, subtitle?, width?, height?, style?, brandTones?, refImageUrl? }
   Returns: { url, transparent } | { error }
   需要 OPENROUTER_API_KEY（生字）＋ FAL_KEY（去背，選用；失敗退回不透明）。
   ============================================================ */
import { NextResponse } from "next/server";
import { removeBackground } from "@/lib/fal";
import { describeImageOpenRouter } from "@/lib/openrouter";
import { loadBuffer, saveBuffer } from "@/lib/storage";
import sharp from "sharp";

export const maxDuration = 120;

const OR = "https://openrouter.ai/api/v1/chat/completions";
const IMG_MODEL = "google/gemini-3-pro-image-preview";

/** 直接叫 Gemini 圖片編輯：喺白底畫布上照 prompt 畫，回 Buffer（png）。 */
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
    const { text, subtitle, width, height, style, brandTones, refImageUrl, editImageUrl, instruction } = await request.json();
    if (!text || !String(text).trim()) return NextResponse.json({ error: "缺少文字" }, { status: 400 });
    const hasRef = typeof refImageUrl === "string" && /^(data:image\/|https?:\/\/|\/)/.test(refImageUrl);
    const isEdit = typeof editImageUrl === "string" && !!editImageUrl && typeof instruction === "string" && !!instruction.trim();

    const target = String(text).trim();
    const toneHint = Array.isArray(brandTones) && brandTones.length ? ` Prefer these brand colours: ${brandTones.slice(0, 3).join(", ")}.` : "";
    const subLine = subtitle && String(subtitle).trim() ? ` Below it, in a much smaller matching style, render the subtitle text "${String(subtitle).trim()}".` : "";
    const commonRules =
      `CRITICAL RULES: pure flat solid WHITE (#FFFFFF) background, absolutely nothing else in the image — no product, no photo, no scene, no people, no objects, no borders, no frame, no decorative background patterns. ` +
      `Do NOT draw any quotation marks, brackets, guillemets or delimiter symbols — only the actual characters ${target}. ` +
      `FRAMING (extremely important): the ENTIRE text block must occupy only the central ~65% width and ~55% height of the image, surrounded by a big empty white margin on all four sides. Every part — each character AND every decorative flourish, swirl, tail, serif, outline, glow and drop shadow — must stay well inside, never touching or crossing any edge (top, bottom, left, right). When unsure, make the lettering SMALLER; excess empty margin is fine and preferred, clipping is unacceptable. ` +
      `Make the lettering clean, high-contrast and well-readable. Just the stylized text on white.`;

    let baseUrl: string;
    let prompt: string;

    if (isEdit) {
      // AI 微調：拿現有藝術字（可能已透明）壓平到白底做底圖，照指令改，字元不變
      const cur = await loadBuffer(editImageUrl);
      const flat = await sharp(Buffer.from(cur)).flatten({ background: "#ffffff" }).png().toBuffer();
      baseUrl = `data:image/png;base64,${flat.toString("base64")}`;
      prompt =
        `This image is an existing piece of word-art (藝術字) on a white background. Modify it according to this instruction: 「${String(instruction).trim()}」. ` +
        `Keep the EXACT same text — the characters must stay <<<${target}>>> (delimiters not part of text), same wording, order and spelling; do not add or remove any characters. Only change the requested visual aspect and keep everything else consistent. ` +
        commonRules;
    } else {
      // 生成尺寸：夾在 768–1280、保留圖層框長寬比（太小 Gemini 畫唔清楚）
      const boxW = Math.round(width) > 0 ? Math.round(width) : 1008;
      const boxH = Math.round(height) > 0 ? Math.round(height) : 256;
      const genW = Math.min(1280, Math.max(768, boxW));
      // 多給 ~35% 垂直空間 + 至少 42% 高的比例，讓高字（含外框/陰影）有留白不被切
      const genH = Math.min(1280, Math.max(Math.round(genW * 0.42), Math.round(genW * (boxH / boxW) * 1.35)));
      const whiteBuf = await sharp({ create: { width: genW, height: genH, channels: 3, background: "#ffffff" } }).png().toBuffer();
      baseUrl = `data:image/png;base64,${whiteBuf.toString("base64")}`;

      // 有參考圖 → 先用視覺模型「只描述風格（唔講內容文字）」，再拿呢段描述去生字。
      // 咁圖像模型完全睇唔到參考圖，就唔可能抄到參考圖上嘅字。
      let styleHint = STYLE_HINTS[String(style)] || STYLE_HINTS.gradient;
      if (hasRef) {
        const desc = await describeImageOpenRouter(
          refImageUrl,
          `Describe ONLY the visual TYPOGRAPHY STYLE of the lettering/word-art in this image, so it can be reproduced with different words. ` +
            `Cover: font style/weight, colour palette and gradients (name hex-ish colours), outline/stroke, drop shadow or glow, 3D/bevel/texture/material, and any decorative flourishes. ` +
            `⚠️ Do NOT transcribe, quote or mention the ACTUAL words, characters or numbers shown — describe style only, in one compact English sentence.`,
          180,
        );
        if (desc && desc.trim()) styleHint = desc.trim();
      }

      prompt =
        `Render ONLY the following text as a single piece of decorative artistic typography (word art / 藝術字), horizontally centered, large and readable but leaving clear empty margins around it (do NOT fill the frame edge-to-edge). ` +
        `The text to render (delimited by <<< >>>, the delimiters are NOT part of the text) is: <<<${target}>>> — use these exact characters, same order and spelling, nothing added or removed.${subLine} ` +
        `Apply this visual style to the lettering: ${styleHint}.${toneHint} ` +
        commonRules;
    }

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
          // 依透明區裁到文字實際範圍 + 留少少邊，避免多餘留白/被切；裁失敗就用原圖
          let out = Buffer.from(cut);
          try {
            const trimmed = await sharp(out).trim({ threshold: 10 }).toBuffer();
            const m = await sharp(trimmed).metadata();
            const pad = Math.max(8, Math.round(Math.max(m.width ?? 0, m.height ?? 0) * 0.04));
            out = await sharp(trimmed).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
          } catch { /* 裁切失敗 → 用未裁的去背圖 */ }
          const url = await saveBuffer(out, "png", "ml-arttext-");
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
