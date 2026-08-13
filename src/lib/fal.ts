/**
 * Fal.ai 圖片生成 & Inpainting
 */

import { fal } from "@fal-ai/client";
import { describeImageOpenRouter } from "@/lib/openrouter";
import { loadBuffer, saveBuffer, contentTypeForExt } from "@/lib/storage";

function initFal() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set");
  fal.config({ credentials: key });
}

const RATIO_TO_SIZE: Record<string, { width: number; height: number }> = {
  "1:1":  { width: 1024, height: 1024 },
  "4:5":  { width: 820,  height: 1024 },
  "3:4":  { width: 768,  height: 1024 },
  "2:3":  { width: 683,  height: 1024 },
  "9:16": { width: 576,  height: 1024 },
  "4:3":  { width: 1024, height: 768  },
  "3:2":  { width: 1024, height: 683  },
  "16:9": { width: 1024, height: 576  },
};

// ── Claude Vision helpers ─────────────────────────────────────────────────────

// 讀圖描述：改用 OpenRouter vision（OPENROUTER_VISION_MODEL），唔再靠獨立 ANTHROPIC_API_KEY。
async function describeWithClaude(imageUrl: string, prompt: string): Promise<string | null> {
  const dataUrl = await resolveToDataUrl(imageUrl);
  if (!dataUrl) return null;
  return describeImageOpenRouter(dataUrl, prompt);
}

export async function describeProduct(productImageUrl: string): Promise<string | null> {
  return describeWithClaude(productImageUrl,
    "Describe this product in 3-5 sentences for an image generation AI that will design a marketing scene around it. " +
    "Be precise and visual, not generic. Cover: (1) exact category — if it's food or drink, name the specific dish/item " +
    "(e.g. 'chocolate layer cake', not just 'dessert') and its visible texture/toppings/garnish/condiments; " +
    "(2) shape, color, materials, packaging design, brand name if visible; " +
    "(3) any distinctive decorative motif, pattern, or theme printed/embossed on the product or packaging " +
    "(e.g. floral print, geometric pattern, specific icon) — call it out explicitly since it can inspire matching props in the scene. " +
    "Do not use vague filler like 'elegant' or 'high quality' — describe only what is literally visible. English only."
  );
}

export async function describeStyle(styleImageUrl: string): Promise<string | null> {
  return describeWithClaude(styleImageUrl,
    "Describe the visual style of this image in 2-4 sentences for an image generation AI. Focus on: color palette, lighting mood, composition style, photography/art technique, atmosphere, aesthetic genre (e.g. cinematic, minimalist, editorial, warm lifestyle). Be specific and visual. English only."
  );
}

// ── 產品去背 ─────────────────────────────────────────────────────────────────

export async function removeBackground(imageUrl: string): Promise<Buffer | null> {
  try {
    initFal();
    const dataUrl = await resolveToDataUrl(imageUrl);
    if (!dataUrl) return null;
    console.log("[fal] Removing background…");
    const result = await fal.run("fal-ai/birefnet", {
      input: { image_url: dataUrl, model: "General Use (Light)" },
    }) as unknown as { data?: { image?: { url: string } } };
    const url = result.data?.image?.url;
    if (!url) return null;
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log("[fal] ✅ Background removed");
    return buf;
  } catch (e) {
    console.warn("[fal] removeBackground failed:", e);
    return null;
  }
}

// ── 文字生圖 ─────────────────────────────────────────────────────────────────

type GenerateOptions = {
  prompt: string;
  imageRatio?: string;
  productImageUrls?: string[];
  styleReferenceUrl?: string;
  seed?: string;
  // 文字燒入（與 prompts.ts enableTextOverlay 對應）
  headline?: string;
  subtitle?: string;
  ctaText?: string;
};

export async function generateImageFal(opts: GenerateOptions): Promise<string> {
  const fallback = `https://picsum.photos/seed/${opts.seed ?? "default"}/1024/1024`;
  if (!process.env.FAL_KEY) {
    console.warn("[fal] No FAL_KEY — using placeholder");
    return fallback;
  }
  try {
    initFal();
    const size = RATIO_TO_SIZE[opts.imageRatio ?? "1:1"] ?? { width: 1024, height: 1024 };

    let finalPrompt = opts.prompt;
    if (opts.productImageUrls?.length) {
      const descs = await Promise.all(
        opts.productImageUrls.slice(0, 3).map((url) => describeProduct(url))
      );
      const combined = descs.filter(Boolean).join("; ");
      if (combined) finalPrompt = `The hero products are: ${combined}. ${opts.prompt}`;
    }
    // 文字燒入模式 vs 禁止文字模式
    if (opts.headline || opts.subtitle || opts.ctaText) {
      finalPrompt +=
        ` Include professional Chinese typography directly burned into the image.` +
        (opts.headline ? ` Headline: "${opts.headline}" — large bold white text at top with dark overlay.` : "") +
        (opts.subtitle ? ` Subtitle: "${opts.subtitle}" — smaller white text below headline.` : "") +
        (opts.ctaText  ? ` CTA at bottom center: pill button with yellow (#FFD700) background, bold dark text "${opts.ctaText}".` : "") +
        ` Do NOT add any other text besides these.`;
    } else {
      finalPrompt += " No text, no letters, no watermarks, no Chinese characters, no typography, photo only.";
    }

    let styleDataUrl: string | undefined;
    if (opts.styleReferenceUrl) {
      styleDataUrl = await resolveToDataUrl(opts.styleReferenceUrl) ?? undefined;
    }

    const falInput: Record<string, unknown> = {
      prompt: finalPrompt,
      image_size: size,
      num_images: 1,
      safety_tolerance: "5",
      guidance_scale: 3.5,
    };
    if (styleDataUrl) {
      falInput.image_prompt = styleDataUrl;
      falInput.image_prompt_strength = 0.12;
    }

    console.log(`[fal] Generating (${size.width}x${size.height})…`);
    const result = await (fal.run as (id: string, opts: { input: Record<string, unknown> }) => Promise<unknown>)(
      "fal-ai/flux-pro/v1.1", { input: falInput }
    ) as { data?: { images?: { url: string }[] } };

    const url = result.data?.images?.[0]?.url;
    if (!url) throw new Error("No image URL in Fal response");
    const localUrl = await downloadAndSave(url, opts.seed);
    console.log(`[fal] ✅ Saved: ${localUrl}`);
    return localUrl;
  } catch (err) {
    console.error("[fal] generateImage error:", err);
    return fallback;
  }
}

// ── Inpainting（局部重繪）──────────────────────────────────────────────────

type InpaintOptions = {
  imageUrl: string;
  maskDataUrl: string;
  prompt: string;
};

export async function inpaintImageFal(opts: InpaintOptions): Promise<string> {
  initFal();

  // 1. 原圖 → Buffer
  console.log("[fal:inpaint] Loading original:", opts.imageUrl.slice(0, 60));
  const origBuf = await loadBuffer(opts.imageUrl);

  const ext  = (opts.imageUrl.split(".").pop() ?? "jpg").toLowerCase();
  const mime = contentTypeForExt(ext);

  // 2. 遮罩 base64 → Buffer，並存起嚟以便驗證
  const maskB64 = opts.maskDataUrl.replace(/^data:image\/\w+;base64,/, "");
  const maskBuf = Buffer.from(maskB64, "base64");

  // DEBUG: 先存起遮罩以便驗證
  const debugMaskUrl = await saveBuffer(maskBuf, "png", "debug-mask-");
  console.log("[fal:inpaint] Mask saved for debug:", debugMaskUrl);
  console.log("[fal:inpaint] Mask buffer size:", maskBuf.length, "bytes");

  // 3. 上傳原圖到 Fal storage
  console.log("[fal:inpaint] Uploading original image…");
  const origFile = new File([origBuf], `orig.${ext}`, { type: mime });
  const imageUrl = await fal.storage.upload(origFile);
  console.log("[fal:inpaint] ✅ imageUrl:", imageUrl);

  // 4. 上傳遮罩到 Fal storage
  console.log("[fal:inpaint] Uploading mask…");
  const maskFile = new File([maskBuf], "mask.png", { type: "image/png" });
  const maskUrl = await fal.storage.upload(maskFile);
  console.log("[fal:inpaint] ✅ maskUrl:", maskUrl);

  // 5. flux-pro/v1/fill
  // 極短中立 prompt — 只描述技術要求，不含任何會被渲染成文字的詞
  const finalPrompt = opts.prompt?.trim() || "background fill, smooth blend";
  console.log("[fal:inpaint] Prompt:", finalPrompt.slice(0, 100));
  console.log("[fal:inpaint] Calling flux-pro/v1/fill…");

  const result = await (fal.run as (
    id: string,
    o: { input: Record<string, unknown> }
  ) => Promise<unknown>)(
    "fal-ai/flux-pro/v1/fill",
    { input: { prompt: finalPrompt, image_url: imageUrl, mask_url: maskUrl, num_images: 1 } }
  ) as { data?: { images?: { url: string }[] } };

  const resultUrl = result.data?.images?.[0]?.url;
  if (!resultUrl) throw new Error("flux-pro/v1/fill returned no image");

  const localUrl = await downloadAndSave(resultUrl, `inpaint-${Date.now()}`);
  console.log(`[fal:inpaint] ✅ Done: ${localUrl}`);
  return localUrl;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function resolveToDataUrl(url: string): Promise<string | undefined> {
  try {
    if (url.startsWith("data:")) return url;
    if (url.startsWith("/")) {
      const buf = await loadBuffer(url);
      const ext = url.split(".").pop() ?? "jpeg";
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn("[fal] resolveToDataUrl failed:", e);
    return undefined;
  }
}

async function downloadAndSave(url: string, seed?: string): Promise<string> {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct  = res.headers.get("content-type") ?? "image/jpeg";
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  return saveBuffer(buf, ext, `ai-${seed ?? Date.now()}-`);
}

// ── Flux Schnell（極速生成，支援文字渲染）─────────────────────────────────────

const SCHNELL_SIZE_MAP: Record<string, string | { width: number; height: number }> = {
  "1:1":  "square_hd",
  "4:5":  { width: 820,  height: 1024 },
  "3:4":  "portrait_4_3",
  "2:3":  { width: 683,  height: 1024 },
  "9:16": "portrait_16_9",
  "4:3":  "landscape_4_3",
  "3:2":  { width: 1024, height: 683  },
  "16:9": "landscape_16_9",
};

export async function generateImageFluxSchnell(opts: {
  prompt: string;
  imageRatio?: string;
  seed?: string;
}): Promise<string> {
  const fallback = `https://picsum.photos/seed/${opts.seed ?? "default"}/1024/1024`;
  if (!process.env.FAL_KEY) {
    console.warn("[fal:schnell] No FAL_KEY — using placeholder");
    return fallback;
  }

  try {
    initFal();
    const imageSize = SCHNELL_SIZE_MAP[opts.imageRatio ?? "1:1"] ?? "square_hd";

    console.log(`[fal:schnell] Generating prompt="${opts.prompt.slice(0, 80)}…"`);

    const result = await (fal.run as (id: string, o: { input: Record<string, unknown> }) => Promise<unknown>)(
      "fal-ai/flux/schnell",
      {
        input: {
          prompt:               opts.prompt,
          image_size:           imageSize,
          num_inference_steps:  4,
          num_images:           1,
          enable_safety_checker: false,
        },
      }
    ) as { data?: { images?: { url: string }[] } };

    const url = result.data?.images?.[0]?.url;
    if (!url) throw new Error("flux/schnell returned no image");

    const localUrl = await downloadAndSave(url, opts.seed);
    console.log(`[fal:schnell] ✅ Saved: ${localUrl}`);
    return localUrl;
  } catch (err) {
    console.error("[fal:schnell] Error:", err);
    return fallback;
  }
}

// ── Erase / 物件移除（LaMa Cleaner）────────────────────────────────────────
// 專門擦除物件並無縫填充背景，效果遠優於 FLUX 的空 prompt

export async function eraseImageFal(opts: {
  imageUrl: string;
  maskDataUrl: string;
}): Promise<string> {
  initFal();

  // 1. 原圖 → Buffer → 上傳
  const origBuf = await loadBuffer(opts.imageUrl);
  const ext  = (opts.imageUrl.split(".").pop() ?? "jpg").toLowerCase();
  const mime = contentTypeForExt(ext);
  const imageUrl = await fal.storage.upload(
    new File([origBuf], `orig.${ext}`, { type: mime })
  );

  // 2. 遮罩 → 上傳
  const maskB64 = opts.maskDataUrl.replace(/^data:image\/\w+;base64,/, "");
  const maskBuf = Buffer.from(maskB64, "base64");
  const maskUrl = await fal.storage.upload(
    new File([maskBuf], "mask.png", { type: "image/png" })
  );

  console.log("[fal:erase] Calling flux-pro/v1/fill for erase…");

  // 3. FLUX fill — 移除物件並無縫填充背景
  const result = await (fal.run as (
    id: string,
    o: { input: Record<string, unknown> }
  ) => Promise<unknown>)(
    "fal-ai/flux-pro/v1/fill",
    {
      input: {
        prompt: "",  // 空 prompt = 純 inpainting，根據周圍像素填充，不渲染任何文字
        image_url: imageUrl,
        mask_url:  maskUrl,
        num_images: 1,
      },
    }
  ) as { data?: { images?: { url: string }[] } };

  const resultUrl = result.data?.images?.[0]?.url;
  if (!resultUrl) throw new Error("flux-pro/v1/fill (erase) returned no image");

  const localUrl = await downloadAndSave(resultUrl, `erase-${Date.now()}`);
  console.log(`[fal:erase] ✅ Done: ${localUrl}`);
  return localUrl;
}

// ── Kontext 指令式圖片編輯 ───────────────────────────────────────────────────
// flux-pro/kontext：給圖片 + 一句話，AI 只改你說的部分
// 不需要 mask — 比 fill 更精確、不會產生亂碼文字

export async function editImageFal(opts: {
  imageUrl: string;
  prompt: string;
  areaHint?: string;
  /** 用戶上傳的替換產品參考圖（data URL 或 /uploads/... 路徑）*/
  referenceProductUrl?: string;
}): Promise<string> {
  initFal();

  // 上傳原圖
  const origBuf = await loadBuffer(opts.imageUrl);
  const ext  = (opts.imageUrl.split(".").pop() ?? "jpg").toLowerCase();
  const mime = contentTypeForExt(ext);
  const imageUrl = await fal.storage.upload(new File([origBuf], `orig.${ext}`, { type: mime }));

  // 如果有參考產品圖，用 Claude Vision 描述它
  let refProductDesc: string | null = null;
  if (opts.referenceProductUrl) {
    refProductDesc = await describeProduct(opts.referenceProductUrl);
    console.log(`[fal:kontext] Reference product: ${refProductDesc?.slice(0, 80)}`);
  }

  const location = opts.areaHint ? `In the ${opts.areaHint} area, ` : "";

  const refProductHint = refProductDesc
    ? `Replace the existing product with this specific product: ${refProductDesc}. `
    : "";

  // 偵測「添加物件」指令 → 強調寫實融合
  const isAddObject =
    /\b(add|place|put|include|insert)\b/i.test(opts.prompt) ||
    /加上|放上|加入|加一個|放一個/.test(opts.prompt);
  const addObjectHint = isAddObject
    ? ` The added object must look photorealistic, match the scene lighting, perspective, and cast appropriate shadows. Scale it proportionally to surrounding objects.`
    : "";

  // 有替換產品時，強制鎖定尺寸和位置
  const sizePositionRules = opts.referenceProductUrl
    ? `CRITICAL SIZE AND POSITION RULES: ` +
      `The replacement product MUST occupy EXACTLY the same bounding box, position, and scale as the original product in the image. ` +
      `Do NOT resize the new product — match the original product's pixel dimensions and center point precisely. ` +
      `Do NOT change the canvas size, aspect ratio, or overall image composition in any way. ` +
      `The background, lighting, shadows, and all other elements must remain 100% identical. ` +
      `Only swap the product visual — same size, same position, same perspective angle. `
    : "";

  const finalPrompt =
    `${location}${refProductHint}${opts.prompt}.${addObjectHint} ` +
    sizePositionRules +
    `CRITICAL: Keep ALL existing text and typography 100% identical — same characters, same position, same style. ` +
    `Do not remove, replace, or modify any existing text. ` +
    `Keep the person's face, hair, skin tone, and pose IDENTICAL. ` +
    `Only modify exactly what was requested.`;

  console.log(`[fal:kontext] Editing — prompt: "${finalPrompt.slice(0, 150)}"`);

  const result = await (fal.run as (id: string, o: { input: Record<string, unknown> }) => Promise<unknown>)(
    "fal-ai/flux-pro/kontext",
    {
      input: {
        prompt:         finalPrompt,
        image_url:      imageUrl,
        guidance_scale: opts.referenceProductUrl ? 10 : 8,  // 替換產品時更嚴格遵守指令
        num_images:     1,
      },
    }
  ) as { data?: { images?: { url: string }[] } };

  const resultUrl = result.data?.images?.[0]?.url;
  if (!resultUrl) throw new Error("flux-pro/kontext returned no image");

  const localUrl = await downloadAndSave(resultUrl, `edit-${Date.now()}`);
  console.log(`[fal:kontext] ✅ Done: ${localUrl}`);
  return localUrl;
}
