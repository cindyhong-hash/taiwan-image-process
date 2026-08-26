/* ============================================================
   POST /api/magic-layers/arttext
   AI 特效字：把一段文字生成成藝術字圖（立體/漸層/書法…）。
   作法：純白底 → Gemini 只畫「隔離的藝術字」→ 去背成透明 PNG → 疊在版面上。
   內容鎖定（Content Lock）：最終只顯示 CONTENT 的文字，一字不差；參考圖只當
   風格來源，其文字內容一律忽略。可選傳入 guideImageUrl（前端用真字體把目標文字
   畫成引導圖）→ AI 只上風格、不重畫字形，大幅降低破字/改字。
   沒有參考圖時：可傳 sceneImageUrl（整張畫面），AI 以資深設計師角度依整體
   氛圍/配色設計最搭的字體風格（而非只看文字）。
   Body: { text, subtitle?, width?, height?, style?, brandTones?,
           refImageUrl?（風格參考）, guideImageUrl?（字形引導）,
           sceneImageUrl?（整張畫面，供無參考圖時依畫面設計）,
           editImageUrl?+instruction?（AI 微調 image-to-image） }
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

/** 直接叫 Gemini 圖片編輯：喺白底畫布上照 prompt 畫，回 Buffer（png）。
    refUrl 有值時當作「風格參考圖」一齊餵入（第二張圖），提升風格保真度。 */
async function geminiRender(dataUrl: string, prompt: string, refUrl?: string | null): Promise<Buffer | null> {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }];
  if (refUrl) content.push({ type: "image_url", image_url: { url: refUrl } });
  const res = await fetch(OR, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: IMG_MODEL,
      messages: [{ role: "user", content }],
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
    const { text, subtitle, width, height, style, brandTones, refImageUrl, guideImageUrl, sceneImageUrl, editImageUrl, instruction } = await request.json();
    if (!text || !String(text).trim()) return NextResponse.json({ error: "缺少文字" }, { status: 400 });
    const isImgUrl = (v: unknown): v is string => typeof v === "string" && /^(data:image\/|https?:\/\/|\/)/.test(v);
    const hasRef = isImgUrl(refImageUrl);
    const hasGuide = isImgUrl(guideImageUrl);
    const hasScene = isImgUrl(sceneImageUrl);
    const isEdit = isImgUrl(editImageUrl) && typeof instruction === "string" && !!instruction.trim();

    const target = String(text).trim();
    const toneHint = Array.isArray(brandTones) && brandTones.length ? ` Prefer these brand colours: ${brandTones.slice(0, 3).join(", ")}.` : "";
    const subLine = subtitle && String(subtitle).trim() ? ` Below it, in a much smaller matching style, render the subtitle text "${String(subtitle).trim()}".` : "";

    // 內容鎖定：最終作品必須「一字不差」顯示 CONTENT，且忽略參考圖上的任何文字
    const contentLock =
      `STRICT CONTENT LOCK — the artwork MUST display EXACTLY this text, once:\nCONTENT: <<<${target}>>>\n` +
      `- Preserve every character, number, punctuation and spacing exactly. Do NOT replace / remove / add / reorder any character. Numbers stay identical (e.g. "88" must remain "88", never a symbol). ` +
      `- Any text visible inside the STYLE_REFERENCE must be IGNORED as content — never copy its words, sentences, logos or numbers. The output shows <<<${target}>>> and nothing else textual.${subLine} ` +
      `- Do NOT draw the <<< >>> delimiters or any quotation marks/brackets — only the actual characters ${target}.`;
    // 構圖：完整、不裁切、四周留白（之後還會用 alpha bounding box 再裁一次）
    const composition =
      `COMPOSITION: solid flat WHITE (#FFFFFF) background, nothing else besides the styled text — no product/photo/scene/border/background pattern. ` +
      `Keep the COMPLETE artwork inside the canvas with generous empty margin (>=12–15% on every side). Never crop any character, outline, stroke, shadow, glow or decorative element; nothing may touch or cross any edge. When unsure, scale the lettering DOWN — excess margin is preferred, clipping is unacceptable.`;

    let baseUrl: string;
    let prompt: string;
    let refForModel: string | null = hasRef ? refImageUrl : null;

    // 參考圖 → 先用視覺模型只描述「字本身」的視覺風格（不讀內容文字），強化風格保真
    let styleHint = STYLE_HINTS[String(style)] || STYLE_HINTS.gradient;
    if (hasRef && !isEdit) {
      const desc = await describeImageOpenRouter(
        refImageUrl,
        `Describe ONLY the visual TYPOGRAPHY STYLE of the lettering/word-art in this image, so it can be reproduced with different words. ` +
          `Focus above all on the COLOUR OF THE GLYPHS THEMSELVES (the fill colour of the letter strokes) — give the closest hex code(s); if it is a gradient, name the from→to hex. This is the letters' OWN colour, usually DIFFERENT from the background colour — describe ONLY the letter fill, and note the background colour separately just so it is not confused with the text. ` +
          `Also cover: font style/weight, outline/stroke colour+thickness, drop shadow or glow, 3D/bevel/texture/material, decorative flourishes. ` +
          `⚠️ Do NOT transcribe, quote or mention the ACTUAL words, characters or numbers shown — describe style only, in 1-2 compact English sentences.`,
        220,
      );
      if (desc && desc.trim()) styleHint = desc.trim();
    }
    // 沒有參考圖但有整張畫面 → 以「資深視覺設計師」角度分析整體氛圍/配色，設計最搭的字體風格
    if (!hasRef && hasScene && !isEdit) {
      const rec = await describeImageOpenRouter(
        sceneImageUrl,
        `You are a senior visual designer. This image is the FULL ad/poster design that a headline will be placed on. ` +
          `First read the overall scene: subject, mood/theme (e.g. fresh / summer / travel / luxury / tech / festive), colour palette and brightness, and how much decoration would feel appropriate. ` +
          `Then recommend the single most fitting HEADLINE TYPOGRAPHY STYLE so the text feels native to this design — pick fill colour or gradient (give hex, drawn from or harmonising with the scene palette, with enough contrast to be readable over it), whether to use an outline (and its colour), shadow/depth level, and any light thematic touch. ` +
          `Match the scene's energy — do NOT propose styles that clash with it (e.g. no neon / cyberpunk / flames / metallic-tech on a soft bright summer beach scene). Prefer tasteful, on-brand promo styling, not garish. ` +
          `Reply with ONE compact English sentence describing the recommended lettering style only (no mention of the actual words).`,
        220,
      );
      if (rec && rec.trim()) styleHint = rec.trim();
    }
    const styleClause = hasRef
      ? `STYLE_REFERENCE (the second image) is the LOOK to reproduce as CLOSELY AS POSSIBLE — the result should look like it was made by the same designer, in the same style family: ${styleHint}. ` +
        `Copy its full visual treatment faithfully: exact glyph FILL colours (match precisely; if the reference uses two layered colours — e.g. a main colour with a second offset colour behind — reproduce BOTH; ignore only the reference's plain background colour), gradient direction, the outline colour and thickness, the drop shadow / 3D depth / extrusion, the italic/slant angle, and the overall dynamic, energetic layout and mood. ` +
        `Only leave out purely pictorial content that isn't part of the lettering style (do not copy the reference's actual words, logos, mascots or unrelated background objects).`
      : `Target visual style: ${styleHint}.`;

    if (isEdit) {
      // AI 微調：image-to-image，拿現有藝術字壓平到白底做底圖，只改風格、內容鎖定
      const cur = await loadBuffer(editImageUrl);
      const flat = await sharp(Buffer.from(cur)).flatten({ background: "#ffffff" }).png().toBuffer();
      baseUrl = `data:image/png;base64,${flat.toString("base64")}`;
      prompt =
        `You are editing an EXISTING typography artwork (shown on the canvas). Apply ONLY this visual change requested by the user: 「${String(instruction).trim()}」. ` +
        `Keep the existing composition, layout and glyph shapes; change only the requested visual aspect and keep everything else consistent.${hasRef ? " The second image is the original STYLE_REFERENCE for guidance." : ""} ` +
        contentLock + " " + composition;
    } else if (hasGuide) {
      // 字形 guide：底圖已用真字體畫好目標文字 → AI 只上風格、不可重畫字形（大幅降低破字/改字）
      baseUrl = guideImageUrl;
      prompt =
        `You are creating a standalone typography artwork. The canvas shows the exact target characters drawn in a plain font — use it ONLY as the source of truth for WHICH characters to draw and their reading order. ` +
        `Every character must stay the same identifiable glyph (do not change/add/remove/substitute or break any character, keep "88" as "88"). ` +
        `But you SHOULD transform the presentation to match the reference: you may re-slant/italicise, re-scale, tilt/perspective and re-arrange the characters into a dynamic layout, and fully re-style them (colour, layered dual colour, gradient, outline, shadow, 3D depth, texture) so the result closely resembles the STYLE_REFERENCE. Do not stay flat and upright if the reference is slanted/3D. ` +
        styleClause + " " + contentLock + " " + composition;
    } else {
      // 後備：無 guide → 白底從零生成
      const boxW = Math.round(width) > 0 ? Math.round(width) : 1008;
      const boxH = Math.round(height) > 0 ? Math.round(height) : 256;
      const genW = Math.min(1280, Math.max(768, boxW));
      const genH = Math.min(1280, Math.max(Math.round(genW * 0.42), Math.round(genW * (boxH / boxW) * 1.35)));
      const whiteBuf = await sharp({ create: { width: genW, height: genH, channels: 3, background: "#ffffff" } }).png().toBuffer();
      baseUrl = `data:image/png;base64,${whiteBuf.toString("base64")}`;
      prompt =
        `You are creating a standalone typography artwork (word art / 藝術字) on the blank white canvas, horizontally centered. ` +
        styleClause + " " + toneHint + " " + contentLock + " " + composition;
    }

    const genBuf = await geminiRender(baseUrl, prompt, refForModel);
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
          let out: Buffer = Buffer.from(cut);
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
