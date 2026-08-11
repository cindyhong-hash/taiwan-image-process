import { NextResponse } from "next/server";
import { after } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { generateImage, generateCopy, compileChineseBrief, translateBriefToEnglishPrompt, falFlux2Edit, falSeedreamEdit, falQwenEdit, falImageEdit, falRemoveBg, falUpscale, describeReferenceStyle, falSceneFromRef, falNanoTextToImage, type GeneratedImage } from "@/lib/generate";
import { loadBuffer, saveBuffer } from "@/lib/storage";

export const maxDuration = 120;

const W = 1024;
const H = 1024;

/** Load an image buffer from a local /uploads path (disk) or a remote URL. */
async function loadImageBuffer(url: string, host: string): Promise<Buffer> {
  if (url.startsWith("/uploads/")) {
    return loadBuffer(url);
  }
  const abs = url.startsWith("http") ? url : `${host}${url}`;
  const res = await fetch(abs, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`無法載入圖片：${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * POST /api/library/generate
 * Two modes:
 *  • 全 AI 生成: compile prompt from slots/subject/notes → HF image + copy
 *  • 合成 (composite): 去背產品 PNG 疊落「直接使用嘅背景圖」或「AI 生成背景」
 *
 * 即刻落一筆 LibraryImage（status:GENERATING）並馬上回應 { id }，令 client 可以安全
 * 關閉 popup ——實際生成用 `after()` 喺 response 送出之後繼續行，完成/失敗都會更新
 * 返嗰筆記錄（DONE/FAILED），畫廊 poll 呢個 id 就會見到最新狀態。
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { clientId, subject, batchId } = body ?? {};
  const host = new URL(request.url).origin;

  const row = await db.libraryImage.create({
    data: {
      clientId: clientId ?? null,
      subject: subject ?? null,
      status: "GENERATING",
      batchId: batchId ?? null,
      paramsJson: JSON.stringify(body ?? {}),
    },
  });

  after(() => runGeneration(row.id, body ?? {}, host));

  return NextResponse.json({ id: row.id, status: "GENERATING" });
}

async function markFailed(rowId: string, message: string) {
  await db.libraryImage.update({
    where: { id: rowId },
    data: { status: "FAILED", errorMessage: message.slice(0, 500) },
  }).catch(() => {});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runGeneration(rowId: string, body: Record<string, any>, host: string): Promise<void> {
  try {
    const { clientId, subject, slots, palette, notes, seed, productImageUrl, productImageUrls, composite, customPrompt, size, customW, customH, engine, upscaleSource, overlay, genType, sceneOverride, refImageUrl } = body;
    // Support 1–3 product photos. New clients send productImageUrls[]; keep productImageUrl for back-compat.
    const productUrls: string[] = (Array.isArray(productImageUrls) && productImageUrls.length
      ? productImageUrls
      : (productImageUrl ? [productImageUrl] : [])).slice(0, 3);

    // Output size 對照表（wireframe ⑧）：正方形 / 橫向 / 直向 / 限時動態。
    const SIZE_MAP: Record<string, { w: number; h: number; ar: string }> = {
      square:    { w: 1200, h: 1200, ar: "1:1" },
      landscape: { w: 1800, h: 1200, ar: "3:2" },
      portrait:  { w: 1200, h: 1800, ar: "2:3" },
      story:     { w: 1080, h: 1920, ar: "9:16" },
    };
    // 自訂尺寸：用戶輸入 闊×高（clamp 256–2400）；aspectRatio 取最接近嘅支援比例（引擎用），
    // 最終 sharp 會裁到實際 outW×outH，所以比例近似唔影響成品尺寸。
    function nearestAR(w: number, h: number): string {
      const r = w / h;
      const cands: [string, number][] = [["1:1", 1], ["3:2", 1.5], ["2:3", 0.667], ["16:9", 1.778], ["9:16", 0.5625]];
      return cands.reduce((best, c) => Math.abs(c[1] - r) < Math.abs(best[1] - r) ? c : best)[0];
    }
    let outW: number, outH: number, aspectRatio: string;
    if (size === "custom" && Number(customW) > 0 && Number(customH) > 0) {
      outW = Math.min(2400, Math.max(256, Math.round(Number(customW))));
      outH = Math.min(2400, Math.max(256, Math.round(Number(customH))));
      aspectRatio = nearestAR(outW, outH);
    } else {
      const dim = SIZE_MAP[size as string] ?? SIZE_MAP.square;
      outW = dim.w; outH = dim.h; aspectRatio = dim.ar;
    }
    // Force the final image to the exact target dimensions (cover) — guarantees the 2 sizes
    // regardless of what each provider returns.
    const fitToSize = async (buf: Buffer) =>
      sharp(buf).resize(outW, outH, { fit: "cover" }).toBuffer();

    // Overlay 主標/副標/CTA as REAL crisp text onto the (final-size) image — sidesteps blurry
    // product labels by putting the key marketing copy on as legible, correct typography.
    const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
    const wrap = (s: string, n: number) => { const o: string[] = []; for (let i = 0; i < s.length; i += n) o.push(s.slice(i, i + n)); return o; };
    const applyTextOverlay = async (buf: Buffer, copyText?: string | null): Promise<Buffer> => {
      if (!overlay?.enabled || !copyText) return buf;
      const pick = (label: string) => (copyText.match(new RegExp(label + "[：:]\\s*(.+)"))?.[1] || "").trim();
      const headline = pick("主標題") || pick("標題");
      const sub = pick("副標題");
      const cta = pick("CTA");
      if (!headline && !sub && !cta) return buf;
      const top = overlay.position === "top";
      const hF = Math.round(outW * 0.066), sF = Math.round(outW * 0.032), cF = Math.round(outW * 0.03);
      const subLines = sub ? wrap(sub, Math.max(8, Math.floor((outW * 0.86) / sF))) : [];
      const bandH = Math.round(hF * 1.5 + subLines.length * sF * 1.35 + (cta ? cF * 2.6 : 0) + outH * 0.07);
      const bandY = top ? 0 : outH - bandH;
      const grad = top
        ? `<linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="black" stop-opacity="0.6"/><stop offset="1" stop-color="black" stop-opacity="0"/></linearGradient>`
        : `<linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity="0.62"/></linearGradient>`;
      const padX = Math.round(outW * 0.07);
      let y = (top ? Math.round(outH * 0.05) : bandY + Math.round(outH * 0.07)) + hF;
      const parts: string[] = [];
      if (headline) { parts.push(`<text x="${padX}" y="${y}" font-size="${hF}" font-weight="700" fill="white" font-family="sans-serif">${escapeXml(headline)}</text>`); y += Math.round(hF * 0.45) + sF; }
      for (const ln of subLines) { parts.push(`<text x="${padX}" y="${y}" font-size="${sF}" fill="white" fill-opacity="0.92" font-family="sans-serif">${escapeXml(ln)}</text>`); y += Math.round(sF * 1.35); }
      if (cta) { const cw = Math.round([...cta].length * cF * 1.05 + cF * 1.8); parts.push(`<rect x="${padX}" y="${y - cF}" width="${cw}" height="${Math.round(cF * 2)}" rx="${cF}" fill="white"/><text x="${padX + cw / 2}" y="${y + Math.round(cF * 0.34)}" font-size="${cF}" font-weight="700" fill="black" text-anchor="middle" font-family="sans-serif">${escapeXml(cta)}</text>`); }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}"><defs>${grad}</defs><rect x="0" y="${bandY}" width="${outW}" height="${bandH}" fill="url(#g1)"/>${parts.join("")}</svg>`;
      return sharp(buf).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
    };

    const copyInput = {
      subject,
      toneAiPrompt: slots?.tone?.aiPromptText,
      toneLabels: slots?.tone?.data?.toneLabels,
      notes,
    };

    // ── Composite mode: place 1–3 products into a scene ──
    if (composite && productUrls.length) {
      let productBuffers = await Promise.all(productUrls.map((u) => loadImageBuffer(u, host)));
      // Opt-in 源圖高清化: faithfully upscale low-res product photos before compositing.
      if (upscaleSource) {
        try {
          productBuffers = await Promise.all(productBuffers.map(async (b) =>
            falUpscale(`data:image/jpeg;base64,${(await sharp(b).jpeg({ quality: 92 }).toBuffer()).toString("base64")}`)));
        } catch (e) {
          console.error("[composite] source upscale failed, using originals:", e instanceof Error ? e.message : e);
        }
      }
      const product = productBuffers[0]; // first product — used by single-product fallbacks (Bria/sharp)
      const bgImageUrl = slots?.background?.data?.imageUrl as string | undefined;

      // Keep the user's original Traditional-Chinese brief for storage/display; translate a separate
      // English copy only to feed the image model (which works best in English).
      // 潤色後嘅場景描述（不含主體）優先；否則由積木組裝。
      const sceneCn = (sceneOverride as string | undefined)?.trim() || compileChineseBrief({
        compositionDesc: (slots?.layout?.data?.description as string) || slots?.layout?.aiPromptText,
        backgroundDesc: bgImageUrl ? (slots?.background?.name as string | undefined) : undefined,
        toneLabels: slots?.tone?.data?.toneLabels,
        palette,
        notes,
      }) || "簡潔專業棚拍背景、柔光";
      const sceneEn = await translateBriefToEnglishPrompt(sceneCn);

      // 餵高清原圖：合成前唔再降到 1024（實測高清令標籤/中文字清晰好多）。
      // 單／雙產品 → 2048；三產品 → 1280（避免多圖 payload 過大令模型 timeout）。
      const prodMax = productUrls.length >= 3 ? 1280 : 2048;
      const toJpegUri = async (buf: Buffer) =>
        `data:image/jpeg;base64,${(await sharp(buf)
          .resize(prodMax, prodMax, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 92 })
          .toBuffer()).toString("base64")}`;
      const productDataUris = await Promise.all(productBuffers.map(toJpegUri));
      // With 3 products, feeding the background as a 4th image overloads the model — use it as
      // TEXT only (its name is already folded into sceneEn via backgroundDesc).
      let refImageDataUri: string | undefined;
      if (bgImageUrl && productUrls.length < 3) {
        refImageDataUri = await toJpegUri(await loadImageBuffer(bgImageUrl, host));
      }

      // 完成一組合成結果 → 更新返嗰筆 GENERATING 記錄做 DONE。
      const saveComposite = async (img: GeneratedImage, mode: string, promptStr: string, copyText: string | null) => {
        const sized = await applyTextOverlay(await fitToSize(img.buffer), copyText);
        const ext = overlay?.enabled ? "png" : (img.contentType.includes("webp") ? "webp" : img.contentType.includes("jpeg") ? "jpg" : "png");
        const imageUrl = await saveBuffer(sized, ext);
        await db.libraryImage.update({
          where: { id: rowId },
          data: {
            status: "DONE",
            imageUrl,
            prompt: promptStr,
            copyText: copyText || null,
            paramsJson: JSON.stringify({ slots, palette, notes, productImageUrl: productUrls[0], productImageUrls: productUrls, composite: true, mode }),
          },
        });
      };

      // ── Engine selection (user-chosen via 合成方式): try the chosen primary, then fall back. ──
      //   • flux2edit — FLUX.2 pro edit（主力：中文字保真最好、可換背景、收多產品）
      //   • nano      — fal nano-banana（自然、多產品；中文字可能糊）
      //   • seedream  — Seedream 4.5 edit（場景最自然、穩定；取代 GPT）
      //   • qwen      — Qwen Image Edit Plus（中文字專家，較慢）
      //   • paste     — 文字保真貼圖（rembg 真像素貼上，字 100% 不糊；融合感較平）
      const tryFlux2Edit = async () => {
        const [img, copy] = await Promise.all([
          falFlux2Edit({ productDataUris, refImageDataUri, sceneDescription: sceneEn, aspectRatio }),
          generateCopy(copyInput),
        ]);
        await saveComposite(img, "flux2-edit", `[AI 合成] ${sceneCn}`, copy.copyText);
      };
      const tryNano = async () => {
        const [img, copy] = await Promise.all([
          falImageEdit({ productDataUris, refImageDataUri, sceneDescription: sceneEn, aspectRatio }),
          generateCopy(copyInput),
        ]);
        await saveComposite(img, "fal-edit", `[AI 合成] ${sceneCn}`, copy.copyText);
      };
      const trySeedream = async () => {
        const [img, copy] = await Promise.all([
          falSeedreamEdit({ productDataUris, refImageDataUri, sceneDescription: sceneEn, aspectRatio }),
          generateCopy(copyInput),
        ]);
        await saveComposite(img, "seedream-edit", `[AI 合成] ${sceneCn}`, copy.copyText);
      };
      const tryQwen = async () => {
        const [img, copy] = await Promise.all([
          falQwenEdit({ productDataUris, refImageDataUri, sceneDescription: sceneEn, aspectRatio }),
          generateCopy(copyInput),
        ]);
        await saveComposite(img, "qwen-edit", `[AI 合成] ${sceneCn}`, copy.copyText);
      };
      // 文字保真：rembg 攞每件產品真像素 → 貼落 AI/所選背景（唔重畫 → 中文字 100% 清晰）。
      const tryPaste = async () => {
        const cutouts = await Promise.all(productBuffers.map(async (b) =>
          falRemoveBg(`data:image/png;base64,${(await sharp(b).png().toBuffer()).toString("base64")}`)));
        const backdrop = bgImageUrl
          ? await loadImageBuffer(bgImageUrl, host)
          : (await generateImage({ prompt: sceneEn, seed, width: outW, height: outH })).buffer;
        const base = await sharp(backdrop).resize(outW, outH, { fit: "cover" }).toBuffer();
        const k = cutouts.length;
        const layers = [];
        for (let idx = 0; idx < k; idx++) {
          const prod = await sharp(cutouts[idx])
            .resize({ width: Math.round(outW * (k === 1 ? 0.6 : 0.42)), height: Math.round(outH * (k === 1 ? 0.72 : 0.58)), fit: "inside" })
            .png().toBuffer();
          const pm = await sharp(prod).metadata();
          const slot = outW / k;
          layers.push({
            input: prod,
            left: Math.max(0, Math.round(slot * idx + (slot - (pm.width ?? 0)) / 2)),
            top: Math.max(0, Math.round(outH * 0.93 - (pm.height ?? 0))),
          });
        }
        const out = await sharp(base).composite(layers).png().toBuffer();
        const copy = await generateCopy(copyInput);
        await saveComposite({ buffer: out, contentType: "image/png", seed: 0 }, "paste-text", `[文字保真貼圖] ${sceneCn}`, copy.copyText);
      };
      // ╔══════════════════════════════════════════════════════════════════════════════════╗
      // ║ 「AI 生圖引擎排序」：改下面 `order`。第 1 個=主力，失敗順序試下一個，全失敗先 sharp 疊圖。║
      // ║  helper：tryFlux2Edit（主力）、tryNano、trySeedream、tryQwen、tryPaste。詳見 docs/AI-ENGINES.md。║
      // ╚══════════════════════════════════════════════════════════════════════════════════╝
      const order = engine === "nano" ? [tryNano, tryFlux2Edit]
        : engine === "seedream" ? [trySeedream, tryFlux2Edit, tryNano]
        : engine === "qwen" ? [tryQwen, tryFlux2Edit, tryNano]
        : engine === "paste" ? [tryPaste, tryFlux2Edit]
        : [tryFlux2Edit, tryNano];   // 預設 / "flux2edit"：FLUX.2 edit 主力 → Nano 後備
      for (const attempt of order) {
        try { await attempt(); return; }
        catch (e) { console.error("[composite] engine attempt failed, trying next:", e instanceof Error ? e.message : e); }
      }

      // ── Fallback: mechanical sharp overlay (needs a transparent PNG) ──
      const meta = await sharp(product).metadata();
      if (!meta.hasAlpha) {
        await markFailed(rowId, "AI 合成失敗，且產品圖唔係透明去背圖。請先去背（remove.bg / photoroom）再上傳，或重試。");
        return;
      }
      let backdrop: Buffer;
      let bgPrompt = "";
      if (bgImageUrl) {
        backdrop = await loadImageBuffer(bgImageUrl, host);
      } else {
        bgPrompt = sceneEn;
        const bgImg = await generateImage({ prompt: bgPrompt, seed });
        backdrop = bgImg.buffer;
      }
      const [bg, prodResized, copy] = await Promise.all([
        sharp(backdrop).resize(W, H, { fit: "cover" }).toBuffer(),
        sharp(product).resize({ width: Math.round(W * 0.62), height: Math.round(H * 0.62), fit: "inside" }).png().toBuffer(),
        generateCopy(copyInput),
      ]);
      const pm = await sharp(prodResized).metadata();
      const left = Math.round((W - (pm.width ?? 0)) / 2);
      const top = Math.round((H - (pm.height ?? 0)) / 2);
      const out = await sharp(bg).composite([{ input: prodResized, left, top }]).png().toBuffer();
      const imageUrl = await saveBuffer(await applyTextOverlay(await fitToSize(out), copy.copyText), "png");
      await db.libraryImage.update({
        where: { id: rowId },
        data: {
          status: "DONE",
          imageUrl,
          prompt: `[疊圖] ${sceneCn}`,
          copyText: copy.copyText || null,
          paramsJson: JSON.stringify({ slots, palette, notes, seed, productImageUrl: productUrls[0], productImageUrls: productUrls, composite: true, mode: "sharp" }),
        },
      });
      return;
    }

    // ── Full AI generation (Chinese-first) ──
    // The composer sends a Traditional-Chinese design brief as `customPrompt`. If absent,
    // build one from the slots. Then translate it to an optimized English prompt for FLUX.
    const brief = (customPrompt as string | undefined)?.trim() || compileChineseBrief({
      subject,
      compositionDesc: (slots?.layout?.data?.description as string) || slots?.layout?.aiPromptText,
      backgroundDesc: (slots?.background?.data?.description as string) || slots?.background?.aiPromptText,
      toneLabels: slots?.tone?.data?.toneLabels,
      palette,
      notes,
    });

    if (!brief.trim()) {
      await markFailed(rowId, "請至少選一個積木、輸入主體，或上傳產品圖");
      return;
    }

    // If a reference image is provided, analyze its style and prepend to the brief.
    let enrichedBrief = brief;
    if (refImageUrl) {
      try {
        const styleDesc = await describeReferenceStyle(refImageUrl as string, host);
        if (styleDesc) enrichedBrief = `【參考圖風格】${styleDesc}\n\n【生成描述】${brief}`;
      } catch (e) { console.error("[reference style] analysis failed:", e instanceof Error ? e.message : e); }
    }

    // Chinese brief → optimized English FLUX prompt (falls back to brief if no API key).
    const prompt = await translateBriefToEnglishPrompt(enrichedBrief);

    // 生成類型 → 揀模型：真人(FLUX.2 pro) / 插畫(Recraft V3) / nano / 場景(預設 schnell)。
    // nano：有參考圖 → nano-banana/edit 風格遷移；冇參考圖 → nano-banana 純文字生圖。
    const useNano = engine === "nano";
    const useNanoEdit = useNano && !!refImageUrl;
    const genModel = genType === "person" ? "flux-2-pro" : genType === "illustration" ? "recraft" : undefined;
    const genStyle = genType === "illustration" ? "digital_illustration" : undefined;
    const genMode = useNano ? "nano-banana" : genType === "person" ? "flux2-person" : genType === "illustration" ? "recraft-illustration" : "flux-scene";

    let img: GeneratedImage;
    if (useNanoEdit) {
      const refBuf = await loadImageBuffer(refImageUrl as string, host);
      const refDataUri = `data:image/jpeg;base64,${(await sharp(refBuf).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()).toString("base64")}`;
      img = await falSceneFromRef({ refDataUri, sceneDescription: prompt, aspectRatio });
    } else if (useNano) {
      img = await falNanoTextToImage({ prompt, aspectRatio });
    } else {
      [img] = await Promise.all([generateImage({ prompt, seed, width: outW, height: outH, model: genModel, style: genStyle })]);
    }
    const ext = img.contentType.includes("png") ? "png" : img.contentType.includes("webp") ? "webp" : "jpg";
    const fitted = await fitToSize(img.buffer);

    const copy = await generateCopy(copyInput);
    const imageUrl = await saveBuffer(await applyTextOverlay(fitted, copy.copyText), overlay?.enabled ? "png" : ext);
    await db.libraryImage.update({
      where: { id: rowId },
      data: {
        status: "DONE",
        imageUrl,
        // Store the Chinese brief as the human-facing prompt; keep the English render prompt too.
        prompt: brief,
        copyText: copy.copyText || null,
        paramsJson: JSON.stringify({ slots, palette, notes, seed: img.seed, brief, enPrompt: prompt, mode: genMode, genType: genType ?? "scene" }),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[library/generate] error:", message);
    await markFailed(rowId, message);
  }
}
