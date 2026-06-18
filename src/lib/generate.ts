/**
 * generate.ts — pluggable text + image generation
 * ─────────────────────────────────────────────────
 * One module behind which the actual provider hides. Swap providers with the
 * `GEN_PROVIDER` env var (no code change):
 *   • "inapp" (default) — OpenRouter free text model + Pollinations.ai images
 *   • "n8n"             — forwards to an n8n webhook (N8N_WEBHOOK_URL)
 *
 * Mirrors the proven OpenRouter `fetch` pattern from
 * src/app/api/components/analyze/route.ts.
 */

const PROVIDER = process.env.GEN_PROVIDER ?? "inapp";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// Copy uses a cheap, reliable OpenRouter model (same family as the vision model).
const OPENROUTER_TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL ?? "openai/gpt-5.4-nano";
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
// Optional free Pollinations token (https://auth.pollinations.ai) — bypasses the
// anonymous queue/rate limit that returns HTTP 402 from shared/datacenter IPs.
const POLLINATIONS_TOKEN = process.env.POLLINATIONS_TOKEN;
// Fallback image provider: Hugging Face Inference (free token at huggingface.co/settings/tokens).
const HF_TOKEN = process.env.HF_TOKEN;
const HF_IMAGE_MODEL = process.env.HF_IMAGE_MODEL ?? "black-forest-labs/FLUX.1-schnell";
// fal.ai primary image provider (keyId:keySecret)
const FAL_KEY = process.env.FAL_KEY;

// ┌─────────────────────────────────────────────────────────────────────────────────────┐
// │ AI 模型一覽（想換模型就改呢度嘅字串，或喺 .env.local 覆寫對應 env var）。            │
// │   • 合成排序（邊個引擎行先）→ 改 src/app/api/library/generate/route.ts 嘅 `order`。   │
// │   • 各引擎差異/強項、點揀 → docs/AI-ENGINES.md。                                       │
// └─────────────────────────────────────────────────────────────────────────────────────┘
// OpenRouter image-editing model for product compositing (raw product → relit scene).
// gpt-5.4-image-2: better composite quality than gpt-5-image-mini (mini was cheaper/faster but
// the output quality was not good enough). All OpenAI image models on OpenRouter are intermittent.
const OPENROUTER_IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL ?? "openai/gpt-5.4-image-2";
// GPT 影像合成 fallback：gpt crash 時先試呢個較穩較平嘅 mini，再先到 nano/flux2。
export const OPENROUTER_IMAGE_MODEL_FALLBACK = process.env.OPENROUTER_IMAGE_MODEL_FALLBACK ?? "openai/gpt-5-image-mini";
// fal.ai image-editing model (Gemini "nano-banana"): reliable, ~8s, accepts MULTIPLE input images
// (product + the actual background), so it can use the chosen background — not just a text scene.
const FAL_EDIT_MODEL = process.env.FAL_EDIT_MODEL ?? "fal-ai/nano-banana/edit";
// fal.ai nano-banana text-to-image（非 edit）— 無參考圖時的純文字生圖路徑。
const FAL_NANO_T2I_MODEL = process.env.FAL_NANO_T2I_MODEL ?? "fal-ai/nano-banana";
// fal.ai FLUX.2 [pro] edit — 產品合成主力：實測中文字保真度遠勝 nano/bria，仍可換背景/多參考圖。
const FAL_FLUX2_EDIT_MODEL = process.env.FAL_FLUX2_EDIT_MODEL ?? "fal-ai/flux-2-pro/edit";
// fal.ai Seedream 4.5 edit — 取代 GPT：場景最自然、穩定不 crash、中文字同級、收多圖。
const FAL_SEEDREAM_EDIT_MODEL = process.env.FAL_SEEDREAM_EDIT_MODEL ?? "fal-ai/bytedance/seedream/v4.5/edit";
// fal.ai Qwen Image Edit Plus — 中文字專家（autoregressive），收多圖；較慢，用較少 steps。
const FAL_QWEN_EDIT_MODEL = process.env.FAL_QWEN_EDIT_MODEL ?? "fal-ai/qwen-image-edit-plus";
// fal.ai background-removal (transparent PNG cutout) — used by the text-preserving paste pipeline.
const FAL_REMBG_MODEL = process.env.FAL_REMBG_MODEL ?? "fal-ai/birefnet";
// fal.ai upscaler — opt-in "源圖高清化" for low-res product photos (faithful, low creativity).
const FAL_UPSCALE_MODEL = process.env.FAL_UPSCALE_MODEL ?? "fal-ai/clarity-upscaler";
// ── 文字→圖：按「生成類型」揀模型（人物/插畫，獨立生成，唔經產品合成）──
// 真人寫實：FLUX.2 [pro]（prompt 服從度高、真人/打光/文字較強，~$0.03/MP）。
const FAL_FLUX2_MODEL = process.env.FAL_FLUX2_MODEL ?? "fal-ai/flux-2-pro";
// 2D 插畫：Recraft V3（插畫/風格化專用，style=digital_illustration，$0.04/張）。
const FAL_RECRAFT_MODEL = process.env.FAL_RECRAFT_MODEL ?? "fal-ai/recraft/v3/text-to-image";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GenerateCopyInput {
  subject?: string;
  toneAiPrompt?: string | null;
  toneLabels?: string[];
  notes?: string;
  taboos?: string[];
}

export interface GenerateImageInput {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  /** 生圖模型路由："flux-2-pro"（真人）/ "recraft"（插畫）/ undefined（預設 FLUX.1 schnell 場景）。 */
  model?: string;
  /** Recraft 風格：realistic_image | digital_illustration | vector_illustration。 */
  style?: string;
}

export interface GeneratedImage {
  buffer: Buffer;
  contentType: string;
  seed: number;
}

export interface CompilePromptInput {
  subject?: string;
  layoutPrompt?: string | null;
  colorPrompt?: string | null;
  tonePrompt?: string | null;
  backgroundPrompt?: string | null;
  palette?: { hex: string; role?: string; use?: boolean }[];
  notes?: string;
}

// ─── Prompt compilation ─────────────────────────────────────────────────────

/** Build a single positive image prompt from the composer slots + palette + notes. */
export function compileImagePrompt(i: CompilePromptInput): string {
  const parts: string[] = [];
  if (i.subject?.trim()) parts.push(i.subject.trim());
  if (i.layoutPrompt) parts.push(i.layoutPrompt);
  if (i.backgroundPrompt) parts.push(`background: ${i.backgroundPrompt}`);
  if (i.colorPrompt) parts.push(i.colorPrompt);

  const usedColors = (i.palette ?? []).filter((c) => c.use !== false && c.hex);
  if (usedColors.length) {
    parts.push(`color palette: ${usedColors.map((c) => c.hex).join(" ")}`);
  }
  if (i.notes?.trim()) parts.push(i.notes.trim());

  // High-quality marketing visual hint
  parts.push("high quality marketing visual, professional, sharp focus");
  return parts.filter(Boolean).join(", ");
}

/**
 * Build a Traditional-Chinese design brief from the composer fields.
 * This is the human-authored "source of truth"; translateBriefToEnglishPrompt turns it into
 * an English prompt the image model actually understands well.
 */
export interface ChineseBriefInput {
  subject?: string;
  compositionDesc?: string | null;
  backgroundDesc?: string | null;
  toneLabels?: string[];
  palette?: { hex: string; label?: string; role?: string; use?: boolean }[];
  notes?: string;
}

export function compileChineseBrief(i: ChineseBriefInput): string {
  const lines: string[] = [];
  if (i.subject?.trim()) lines.push(`主體：${i.subject.trim()}`);
  if (i.compositionDesc?.trim()) lines.push(`構圖：${i.compositionDesc.trim()}`);
  if (i.backgroundDesc?.trim()) lines.push(`背景：${i.backgroundDesc.trim()}`);
  const used = (i.palette ?? []).filter((c) => c.use !== false && c.hex);
  if (used.length) lines.push(`配色：${used.map((c) => `${c.label ?? ""} ${c.hex}`.trim()).join("、")}`);
  if (i.toneLabels?.length) lines.push(`風格語氣：${i.toneLabels.join("、")}`);
  if (i.notes?.trim()) lines.push(`其他要求：${i.notes.trim()}`);
  return lines.join("\n");
}

/**
 * Translate a (usually Traditional-Chinese) design brief into ONE optimized English prompt for FLUX.
 * Chinese-first authoring, English output — FLUX is trained on English and renders it far better.
 * Falls back to the raw brief if no OpenRouter key (so generation still works).
 */
export async function translateBriefToEnglishPrompt(brief: string): Promise<string> {
  const text = brief.trim();
  if (!text) return "";
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === "your-openrouter-api-key-here") {
    return text; // graceful fallback
  }
  const sys =
    "You are an expert prompt engineer for the FLUX text-to-image model. " +
    "You convert marketing-image design briefs (often written in Traditional Chinese) into a single, " +
    "concise, vivid ENGLISH image-generation prompt. Preserve every concrete detail: subject, composition, " +
    "background, mood, and exact color hex codes. Do NOT add people or text unless the brief asks. " +
    "Output ONLY the final English prompt — no quotes, no explanation, no line breaks.";
  const user = `Design brief:\n${text}\n\nEnglish FLUX prompt:`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Marketing Tool",
      },
      body: JSON.stringify({
        model: OPENROUTER_TEXT_MODEL,
        max_tokens: 300,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.error("[translateBrief] OpenRouter error", res.status, await res.text().catch(() => ""));
      return text; // fallback to raw brief
    }
    const data = await res.json();
    const out = (data.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "");
    return out || text;
  } catch (err) {
    console.error("[translateBrief] failed:", err instanceof Error ? err.message : err);
    return text;
  }
}

/**
 * 潤色寫手：把用戶手寫、簡短或零碎嘅設計指令，擴寫成更完整、有畫面感嘅繁體中文設計 brief。
 * 回傳嘅文字俾用戶喺 UI 編輯後再生圖（opt-in，唔自動套用）。保留原意、唔虛構品牌事實。
 * 無 API key 時原樣回傳（graceful fallback）。
 */
export async function polishBriefToChinese(input: { brief: string; genType?: string; styleDesc?: string }): Promise<string> {
  const text = input.brief.trim();
  if (!text) return "";
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === "your-openrouter-api-key-here") return text;
  const typeHint =
    input.genType === "person" ? "這是一張「真人寫實」行銷圖，請著重描述人物（年齡、表情、動作、穿著、互動）與場景。"
    : input.genType === "illustration" ? "這是一張「2D 插畫風」行銷圖，請著重描述插畫風格、線條、色塊與角色造型。"
    : "這是一張產品 / 場景行銷圖，請著重描述主體擺位、背景場景與質感。";
  const styleHint = input.styleDesc
    ? `\n\n【參考圖風格分析】${input.styleDesc}\n請在擴寫時融入以上風格特徵（色調、光影、質感氣氛），不要參考構圖或佈局，保留用戶原意，只補充具體畫面細節。`
    : "";
  const sys =
    "你是一位資深美術指導兼 AI 生圖 prompt 寫手。你會把用戶手寫、簡短或零碎的設計指令，" +
    "擴寫成一段更完整、具體、有畫面感的繁體中文設計描述，用來生成行銷圖片。\n\n" +
    "【規則】\n" +
    "1. 保留用戶原意與所有已給的具體細節（主體、顏色、文字、風格），只補充畫面細節：構圖、光線、氛圍、背景、材質、鏡頭角度。\n" +
    "2. 嚴禁虛構品牌事實、功效、價格，或加入用戶沒提到的標語文字。\n" +
    "3. 一律繁體中文（台灣用語），100字內（含標點），簡潔有創意，留空間給用戶和 AI 修改，不要過度鋪排。\n" +
    "4. 只輸出擴寫後的中文設計描述，不要解釋、不要英文、不要加標題。";
  const user = `${typeHint}${styleHint}\n\n用戶原始指令：\n${text}\n\n擴寫後的中文設計描述：`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Marketing Tool",
      },
      body: JSON.stringify({
        model: OPENROUTER_TEXT_MODEL,
        max_tokens: 500,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.error("[polishBrief] OpenRouter error", res.status, await res.text().catch(() => ""));
      return text;
    }
    const data = await res.json();
    const out = (data.choices?.[0]?.message?.content ?? "").trim();
    return out || text;
  } catch (err) {
    console.error("[polishBrief] failed:", err instanceof Error ? err.message : err);
    return text;
  }
}

// ─── Copy generation ──────────────────────────────────────────────────────────

export async function generateCopy(input: GenerateCopyInput): Promise<{ copyText: string }> {
  if (PROVIDER === "n8n") return generateCopyN8n(input);
  return generateCopyInApp(input);
}

// 角色（persona）放正式 system role：模型對 system 指令遵從度較高、較穩定，
// 唔會被 user 內容沖淡。措辭、語言規定、輸出格式都收喺呢度。
const COPY_SYSTEM =
  "你是一位資深社群媒體文案師，專為台灣品牌寫 Facebook / Instagram 貼文文案。" +
  "你擅長用最少字數打中受眾痛點、製造點擊慾，語感自然、貼地、不浮誇、不堆砌形容詞。\n\n" +
  "【語言規定】一律用繁體中文・台灣用語，嚴禁簡體字或英文（專有名詞除外）。\n" +
  "【輸出格式｜只回傳以下三行，不要任何解釋、標籤或多餘文字】\n" +
  "主標題：（10字以內，要有鉤子）\n" +
  "副標題：（20-30字，補充賣點或情境）\n" +
  "CTA：（5字以內，行動呼籲）";

function buildCopyPrompt(i: GenerateCopyInput): string {
  return `請根據以下條件寫文案：

主體 / 主題：${i.subject?.trim() || "（未指定）"}
語氣風格：${i.toneAiPrompt || i.toneLabels?.join("、") || "標準、自然"}
其他注意事項：${i.notes?.trim() || "無"}
禁忌事項：${i.taboos?.length ? i.taboos.join("、") : "無"}`;
}

async function generateCopyInApp(input: GenerateCopyInput): Promise<{ copyText: string }> {
  // Graceful degradation: if no key, return empty so image generation still succeeds.
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === "your-openrouter-api-key-here") {
    return { copyText: "" };
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Marketing Tool",
      },
      body: JSON.stringify({
        model: OPENROUTER_TEXT_MODEL,
        max_tokens: 400,
        messages: [
          { role: "system", content: COPY_SYSTEM },
          { role: "user", content: buildCopyPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.error("[generateCopy] OpenRouter error", res.status, await res.text().catch(() => ""));
      return { copyText: "" };
    }
    const data = await res.json();
    const copyText = (data.choices?.[0]?.message?.content ?? "").trim();
    return { copyText };
  } catch (err) {
    console.error("[generateCopy] failed:", err instanceof Error ? err.message : err);
    return { copyText: "" };
  }
}

async function generateCopyN8n(input: GenerateCopyInput): Promise<{ copyText: string }> {
  if (!N8N_WEBHOOK_URL) throw new Error("GEN_PROVIDER=n8n 但 N8N_WEBHOOK_URL 未設定");
  const res = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "copy", ...input }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`n8n copy webhook 錯誤 ${res.status}`);
  const data = await res.json();
  return { copyText: (data.copyText ?? "").toString() };
}

// ─── Image generation ───────────────────────────────────────────────────────

export async function generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
  if (PROVIDER === "n8n") return generateImageN8n(input);
  return generateImageInApp(input);
}

/** In-app image: fal.ai (primary) → HuggingFace FLUX (fallback). */
async function generateImageInApp(input: GenerateImageInput): Promise<GeneratedImage> {
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000_000);

  // 1st priority: fal.ai. 按「生成類型」(input.model) 揀模型；prem 模型失敗就回落 schnell。
  if (FAL_KEY) {
    try {
      if (input.model === "flux-2-pro") return await falFlux2Pro(input, seed);
      if (input.model === "recraft") return await falRecraft(input, seed);
      return await falAiImage(input, seed);
    } catch (e) {
      console.error("[generateImage] fal.ai failed:", e instanceof Error ? e.message : e);
      // 真人/插畫模型失敗 → 回落 schnell（總好過冇圖），再失敗先去 HF。
      if (input.model) {
        try { return await falAiImage(input, seed); }
        catch (e2) { console.error("[generateImage] fal schnell fallback failed:", e2 instanceof Error ? e2.message : e2); }
      }
    }
  }

  // 2nd priority: HuggingFace FLUX (素材生成 / fallback)
  if (HF_TOKEN) {
    try {
      return await huggingFaceImage(input, seed);
    } catch (e) {
      const hfErr = e instanceof Error ? e.message : String(e);
      console.error("[generateImage] HuggingFace failed:", hfErr);
      throw new Error(`圖片生成失敗（fal.ai + HuggingFace 均失敗）：${hfErr}`);
    }
  }

  // Last resort: Pollinations (only when no other provider)
  if (POLLINATIONS_TOKEN || !FAL_KEY) {
    try {
      return await pollinationsImage(input, seed);
    } catch (e) {
      throw new Error(`圖片生成失敗：${e instanceof Error ? e.message : e}`);
    }
  }

  throw new Error("請在 .env.local 設定 FAL_KEY 或 HF_TOKEN 以啟用圖片生成");
}

/**
 * AI product compositing via fal.ai Bria Product Shot (fal-ai/bria/product-shot, ~$0.04/image).
 * Places a product image into an AI-generated scene — either from a reference background image
 * (refImageDataUri) OR a text scene description. Returns the composited image.
 * Images are passed as data URIs so fal's servers don't need to reach our localhost /uploads.
 */
export interface ProductShotInput {
  productDataUri: string;        // the product cutout (data:image/png;base64,...)
  refImageDataUri?: string;      // optional reference background image
  sceneDescription?: string;     // used when no reference image (English works best)
  shotSize?: number[];           // [w,h] output size — render large then downscale for crisp text
}

export async function falProductShot(i: ProductShotInput): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定，無法做 AI 合成");
  const body: Record<string, unknown> = {
    image_url: i.productDataUri,
    num_results: 1,
    placement_type: "automatic", // let Bria place the product naturally (not forced-centre)
    sync_mode: false,
  };
  if (i.shotSize) body.shot_size = i.shotSize;
  if (i.refImageDataUri) body.ref_image_url = i.refImageDataUri;
  else if (i.sceneDescription?.trim()) body.scene_description = i.sceneDescription.trim();
  else body.scene_description = "clean professional studio background, soft lighting";

  const res = await fetch("https://fal.run/fal-ai/bria/product-shot", {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Bria product-shot 錯誤 ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("Bria product-shot 回應無圖片 URL");
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`Bria 圖片下載失敗：${imgRes.status}`);
  const contentType = imgRes.headers.get("content-type") ?? "image/png";
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType, seed: 0 };
}

/**
 * AI product compositing via an OpenRouter image-editing model (default openai/gpt-5.4-image-2).
 * Unlike Bria, this accepts a RAW product photo (no pre-cut transparent PNG): the model removes
 * the original background, relights the product, adds realistic shadows and adjusts perspective so
 * it sits believably in the scene. An optional reference image guides the background/scene.
 */
export interface GptCompositeInput {
  productDataUri: string;       // raw product photo (data:image/...;base64,...)
  refImageDataUri?: string;     // optional generated-background reference
  sceneDescription?: string;    // scene steer (used always; English works best)
  aspectRatio?: string;         // "1:1" | "3:2" — output aspect
  model?: string;               // override OpenRouter image model (e.g. mini fallback)
}

export async function gptImageComposite(i: GptCompositeInput): Promise<GeneratedImage> {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY 未設定，無法用 GPT 影像合成");
  const sceneLine = i.refImageDataUri
    ? "Use the SECOND image as the background/scene reference — match its setting, surface, lighting and mood."
    : `Scene/background: ${i.sceneDescription?.trim() || "clean professional studio, soft natural light"}.`;
  const instruction = [
    "Create ONE photorealistic product marketing image.",
    "Take the product shown in the FIRST image, cleanly remove its original background,",
    "and place it naturally into the scene. Relight it to match the scene, add realistic soft",
    "shadows and reflections, and adjust its perspective so it sits believably — not a flat paste.",
    "Keep the product's exact shape, colour, label text and proportions unchanged.",
    sceneLine,
    `No added text, watermark or logo. ${i.aspectRatio === "3:2" ? "Landscape 3:2 composition." : "Square composition."}`,
  ].join(" ");

  const content: Record<string, unknown>[] = [
    { type: "text", text: instruction },
    { type: "image_url", image_url: { url: i.productDataUri } },
  ];
  if (i.refImageDataUri) content.push({ type: "image_url", image_url: { url: i.refImageDataUri } });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json", "X-Title": "Marketing Tool" },
    body: JSON.stringify({ model: i.model ?? OPENROUTER_IMAGE_MODEL, modalities: ["image", "text"], messages: [{ role: "user", content }] }),
    // All OpenAI image models on OpenRouter (gpt-5-image-mini / gpt-5-image / gpt-5.4-image-2) are
    // intermittent — sometimes ~1s, sometimes hang for minutes. 60s gives the responsive windows a
    // better chance; otherwise it falls back to the next engine.
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`GPT 影像合成錯誤 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message ?? {};
  // OpenRouter returns generated images under message.images[].image_url.url (data URI or URL).
  const url: string | undefined = msg.images?.[0]?.image_url?.url ?? msg.images?.[0]?.url;
  if (!url) throw new Error("GPT 影像合成回應無圖片");
  if (url.startsWith("data:")) {
    const b64 = url.slice(url.indexOf(",") + 1);
    const ct = url.slice(5, url.indexOf(";")) || "image/png";
    return { buffer: Buffer.from(b64, "base64"), contentType: ct, seed: 0 };
  }
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`GPT 合成圖片下載失敗：${imgRes.status}`);
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType: imgRes.headers.get("content-type") ?? "image/png", seed: 0 };
}

/**
 * AI product compositing via fal.ai image-editing (default Gemini nano-banana, fal-ai/nano-banana/edit).
 * Reliable (~8s) and accepts MULTIPLE input images — so when a background is chosen it places the
 * product into THAT actual background (not just a text scene). Auto removes the product's original
 * background, relights it and corrects perspective for a natural, non-flat composite.
 */
export interface FalEditInput {
  productDataUris: string[];  // 1–3 product photos (placed together into one scene)
  refImageDataUri?: string;   // the chosen background image (used as the LAST input when present)
  sceneDescription?: string;  // text scene when no background image
  aspectRatio?: string;       // "1:1" | "3:2" — output aspect
}

export async function falImageEdit(i: FalEditInput): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定，無法用 fal 影像編輯");
  const products = i.productDataUris.filter(Boolean);
  if (!products.length) throw new Error("falImageEdit: 無產品圖");
  const n = products.length;
  // Refer to the product image(s) and where to put them.
  const subj = n === 1 ? "the product shown in the FIRST image" : `the ${n} products shown in the first ${n} images`;
  const arrange = n === 1 ? "place it naturally" : "arrange them together naturally side by side";
  const keep = n === 1
    ? "Keep the product's exact shape, colour, label text and proportions unchanged."
    : "Keep EACH product's exact shape, colour, label text and proportions unchanged; do not merge or duplicate them.";
  const where = i.refImageDataUri
    ? "into the scene shown in the LAST image"
    : `into this scene: ${i.sceneDescription?.trim() || "a clean professional studio with soft natural light"}`;
  const prompt = `Take ${subj} and ${arrange} ${where}. Remove each product's original background, relight to match the scene, add realistic soft shadows and reflections, and correct perspective so they sit believably. ${keep} Photorealistic, no added text or logo.`;
  const image_urls = i.refImageDataUri ? [...products, i.refImageDataUri] : products;

  const res = await fetch(`https://fal.run/${FAL_EDIT_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_urls, num_images: 1, ...(i.aspectRatio ? { aspect_ratio: i.aspectRatio } : {}) }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`fal 影像編輯錯誤 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error("fal 影像編輯回應無圖片 URL");
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`fal 編輯圖片下載失敗：${imgRes.status}`);
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType: imgRes.headers.get("content-type") ?? "image/png", seed: 0 };
}

/**
 * 產品合成主力：fal FLUX.2 [pro] edit（fal-ai/flux-2-pro/edit）。
 * 實測：中文字／標籤保真度遠勝 nano-banana 同 Bria；仍可換背景（文字場景或參考背景圖）、收多張產品。
 * 同 falImageEdit 一樣收 image_urls（產品[+背景]），prompt 指定擺位與保留標籤。
 */
export async function falFlux2Edit(i: FalEditInput): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定，無法用 FLUX.2 edit");
  const products = i.productDataUris.filter(Boolean);
  if (!products.length) throw new Error("falFlux2Edit: 無產品圖");
  const n = products.length;
  const subj = n === 1 ? "the product shown in the FIRST image" : `the ${n} products shown in the first ${n} images`;
  const arrange = n === 1 ? "place it naturally" : "arrange them together naturally side by side";
  const keep = n === 1
    ? "Keep the product's exact shape, colour, label text (including all Chinese characters) and proportions 100% unchanged — do not redraw or restyle the label."
    : "Keep EACH product's exact shape, colour, label text (including all Chinese characters) and proportions 100% unchanged; do not merge, duplicate or restyle them.";
  const where = i.refImageDataUri
    ? "into the scene shown in the LAST image"
    : `into this scene: ${i.sceneDescription?.trim() || "a clean professional studio with soft natural light"}`;
  const prompt = `Take ${subj} and ${arrange} ${where}. Relight to match the scene, add a realistic soft shadow and subtle reflection, and correct perspective so it sits believably. ${keep} Photorealistic, no added text or logo.`;
  const image_urls = i.refImageDataUri ? [...products, i.refImageDataUri] : products;

  const res = await fetch(`https://fal.run/${FAL_FLUX2_EDIT_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_urls, image_size: i.aspectRatio === "3:2" ? "landscape_4_3" : "square_hd" }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`FLUX.2 edit 錯誤 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error("FLUX.2 edit 回應無圖片 URL");
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`FLUX.2 edit 圖片下載失敗：${imgRes.status}`);
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType: imgRes.headers.get("content-type") ?? "image/png", seed: 0 };
}

/** 共用：產品合成 edit prompt（多圖排位 + 強調保留中文標籤）。 */
function buildProductEditPrompt(i: FalEditInput): string {
  const n = i.productDataUris.filter(Boolean).length;
  const subj = n === 1 ? "the product shown in the FIRST image" : `the ${n} products shown in the first ${n} images`;
  const arrange = n === 1 ? "place it naturally" : "arrange them together naturally side by side";
  const keep = n === 1
    ? "Keep the product's exact shape, colour, label text (including all Chinese characters) and proportions 100% unchanged — do not redraw or restyle the label."
    : "Keep EACH product's exact shape, colour, label text (including all Chinese characters) and proportions 100% unchanged; do not merge, duplicate or restyle them.";
  const where = i.refImageDataUri
    ? "into the scene shown in the LAST image"
    : `into this scene: ${i.sceneDescription?.trim() || "a clean professional studio with soft natural light"}`;
  return `Take ${subj} and ${arrange} ${where}. Relight to match the scene, add a realistic soft shadow and subtle reflection, and correct perspective so it sits believably. ${keep} Photorealistic, no added text or logo.`;
}

/**
 * GPT 替代之一：fal Seedream 4.5 edit — 場景最自然、穩定、收多圖、中文字同 FLUX 同級。
 */
export async function falSeedreamEdit(i: FalEditInput): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定，無法用 Seedream edit");
  const products = i.productDataUris.filter(Boolean);
  if (!products.length) throw new Error("falSeedreamEdit: 無產品圖");
  const image_urls = i.refImageDataUri ? [...products, i.refImageDataUri] : products;
  const res = await fetch(`https://fal.run/${FAL_SEEDREAM_EDIT_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: buildProductEditPrompt(i), image_urls, image_size: i.aspectRatio === "3:2" ? "landscape_4_3" : "square_hd" }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Seedream edit 錯誤 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error("Seedream edit 回應無圖片 URL");
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`Seedream edit 圖片下載失敗：${imgRes.status}`);
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType: imgRes.headers.get("content-type") ?? "image/png", seed: 0 };
}

/**
 * GPT 替代之二：fal Qwen Image Edit Plus — 中文字專家；收多圖。較慢，故用較少 steps + acceleration。
 */
export async function falQwenEdit(i: FalEditInput): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定，無法用 Qwen edit");
  const products = i.productDataUris.filter(Boolean);
  if (!products.length) throw new Error("falQwenEdit: 無產品圖");
  const image_urls = i.refImageDataUri ? [...products, i.refImageDataUri] : products;
  const res = await fetch(`https://fal.run/${FAL_QWEN_EDIT_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: buildProductEditPrompt(i), image_urls,
      image_size: i.aspectRatio === "3:2" ? "landscape_4_3" : "square_hd",
      num_inference_steps: 30, acceleration: "regular", output_format: "jpeg",
    }),
    signal: AbortSignal.timeout(280_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Qwen edit 錯誤 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error("Qwen edit 回應無圖片 URL");
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`Qwen edit 圖片下載失敗：${imgRes.status}`);
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType: imgRes.headers.get("content-type") ?? "image/png", seed: 0 };
}

/**
 * AI 融合打光（模板貼圖可選）：把已貼好嘅 composite 餵 FLUX.2 edit，只融合光影、加真實陰影/反光，
 * 強制保持產品位置/大小/標籤不變。比純貼圖自然，但係生成式 → 有少少 drift 風險（opt-in）。
 */
export async function falRelightComposite(compositeDataUri: string, aspectRatio?: string): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定，無法 AI 融合打光");
  const prompt =
    "This image is a product already placed on a background. Blend the product into the scene so it looks naturally photographed: " +
    "match the scene's lighting direction on the product, add a realistic soft contact shadow and subtle reflection. " +
    "Keep the product's EXACT position, size, shape, colour and all label text (including Chinese characters) 100% unchanged — " +
    "do NOT move, resize, redraw the label, add or remove any object. Only harmonize lighting and shadow. Photorealistic.";
  const res = await fetch(`https://fal.run/${FAL_FLUX2_EDIT_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_urls: [compositeDataUri], image_size: aspectRatio === "3:2" ? "landscape_4_3" : "square_hd" }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`融合打光錯誤 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error("融合打光回應無圖片 URL");
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`融合打光圖下載失敗：${imgRes.status}`);
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType: imgRes.headers.get("content-type") ?? "image/png", seed: 0 };
}

/**
 * Background removal via fal.ai (default fal-ai/birefnet) → transparent-PNG cutout buffer.
 * Used by the text-preserving paste pipeline so the product's real pixels (incl. Chinese label)
 * are pasted unchanged onto an AI background — never redrawn.
 */
export async function falRemoveBg(imageDataUri: string): Promise<Buffer> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定，無法去背");
  const res = await fetch(`https://fal.run/${FAL_REMBG_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageDataUri }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`去背錯誤 ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  const url = data.image?.url ?? data.images?.[0]?.url;
  if (!url) throw new Error("去背回應無圖片 URL");
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`去背圖下載失敗：${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Faithful AI upscale (default fal-ai/clarity-upscaler, low creativity) → sharper buffer.
 * Opt-in "源圖高清化" for low-res product photos. Low creativity + high resemblance keep it
 * faithful (avoids hallucinating wrong characters). Cannot fully restore unreadable text.
 */
export async function falUpscale(imageDataUri: string, factor = 2): Promise<Buffer> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定，無法高清化");
  const res = await fetch(`https://fal.run/${FAL_UPSCALE_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageDataUri, upscale_factor: factor, creativity: 0.1, resemblance: 1.0 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`高清化錯誤 ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  const url = data.image?.url ?? data.images?.[0]?.url;
  if (!url) throw new Error("高清化回應無圖片 URL");
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`高清化圖下載失敗：${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Analyze a reference image with the vision model and return a Traditional-Chinese style description
 * covering composition, color palette, lighting and overall visual mood. Used to enrich generation prompts.
 */
export async function describeReferenceStyle(imageUrl: string, host: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "";
  try {
    const abs = imageUrl.startsWith("http") ? imageUrl : `${host}${imageUrl}`;
    const imgRes = await fetch(abs, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) return "";
    const base64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
    const mediaType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const model = process.env.OPENROUTER_VISION_MODEL ?? "openai/gpt-5.4-nano";
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": host, "X-Title": "Marketing Tool" },
      body: JSON.stringify({
        model, max_tokens: 200,
        messages: [{ role: "user", content: [
          { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
          { type: "text", text: "用繁體中文描述此圖的視覺風格：①主色調與配色方案 ②光線氛圍與打光方式 ③整體質感與材質感 ④情緒氣氛。最多80字。不要描述構圖、佈局或畫面內容，只描述可遷移的風格特徵，供AI生圖風格參考。" },
        ]}],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return (data.choices?.[0]?.message?.content ?? "").trim();
  } catch { return ""; }
}

/**
 * Generate a NEW scene using nano-banana with a reference image as style guidance.
 * The reference image's composition / mood / lighting is used as visual inspiration.
 */
export async function falSceneFromRef(i: { refDataUri: string; sceneDescription: string; aspectRatio?: string }): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定，無法用 Nano Banana");
  // Use the reference image ONLY for style cues (color palette, lighting mood, texture, atmosphere).
  // Do NOT copy its subject matter, composition, or layout — create an entirely new image.
  const prompt = `Create a completely new original image. Use the reference image (first image) ONLY as a style guide — adopt its color palette, lighting quality, texture and overall mood/atmosphere. Do NOT copy the reference image's composition, layout, or subject matter. New scene to create: ${i.sceneDescription}. The result must be a fresh creation that feels aesthetically similar to the reference but is entirely different in content. Photorealistic, high quality, no text, no watermarks.`;
  const res = await fetch(`https://fal.run/${FAL_EDIT_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_urls: [i.refDataUri], num_images: 1, ...(i.aspectRatio ? { aspect_ratio: i.aspectRatio } : {}) }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Nano Banana 場景生成錯誤 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error("Nano Banana 回應無圖片 URL");
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`Nano Banana 圖片下載失敗：${imgRes.status}`);
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType: imgRes.headers.get("content-type") ?? "image/png", seed: 0 };
}

/**
 * Pure text→image via nano-banana（非 edit）。無參考圖時用，行 fal-ai/nano-banana。
 */
export async function falNanoTextToImage(i: { prompt: string; aspectRatio?: string }): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定，無法用 Nano Banana");
  const res = await fetch(`https://fal.run/${FAL_NANO_T2I_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: i.prompt, num_images: 1, ...(i.aspectRatio ? { aspect_ratio: i.aspectRatio } : {}) }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Nano Banana 文字生圖錯誤 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error("Nano Banana 回應無圖片 URL");
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`Nano Banana 圖片下載失敗：${imgRes.status}`);
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType: imgRes.headers.get("content-type") ?? "image/png", seed: 0 };
}

async function falAiImage(input: GenerateImageInput, seed: number): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定");
  const w = input.width ?? 1024;
  const h = input.height ?? 1024;
  const imageSize = w > h ? "landscape_4_3" : h > w ? "portrait_4_3" : "square_hd";

  const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: input.prompt, image_size: imageSize, num_inference_steps: 4, seed, enable_safety_checker: false }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`fal.ai 錯誤 ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const imageUrl = data.images?.[0]?.url;
  if (!imageUrl) throw new Error("fal.ai 回應無圖片 URL");
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`fal.ai 圖片下載失敗：${imgRes.status}`);
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType, seed };
}

/** Map a w×h target to fal's image_size enum (shared by FLUX.2 pro / Recraft). */
function falImageSize(input: GenerateImageInput): string {
  const w = input.width ?? 1024;
  const h = input.height ?? 1024;
  return w > h ? "landscape_4_3" : h > w ? "portrait_4_3" : "square_hd";
}

/** Download a fal result image URL into a GeneratedImage buffer. */
async function falFetchImage(url: string, seed: number): Promise<GeneratedImage> {
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`fal 圖片下載失敗：${imgRes.status}`);
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), contentType, seed };
}

/** 真人寫實 text→image：FLUX.2 [pro]（fal-ai/flux-2-pro）。 */
async function falFlux2Pro(input: GenerateImageInput, seed: number): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定");
  const res = await fetch(`https://fal.run/${FAL_FLUX2_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      image_size: falImageSize(input),
      seed,
      output_format: "jpeg",
      enable_safety_checker: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`FLUX.2 pro 錯誤 ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("FLUX.2 pro 回應無圖片 URL");
  return falFetchImage(url, seed);
}

/** 2D 插畫 text→image：Recraft V3（style 預設 digital_illustration）。 */
async function falRecraft(input: GenerateImageInput, seed: number): Promise<GeneratedImage> {
  if (!FAL_KEY) throw new Error("FAL_KEY 未設定");
  const res = await fetch(`https://fal.run/${FAL_RECRAFT_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      image_size: falImageSize(input),
      style: input.style ?? "digital_illustration",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Recraft V3 錯誤 ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("Recraft V3 回應無圖片 URL");
  return falFetchImage(url, seed);
}

async function pollinationsImage(input: GenerateImageInput, seed: number): Promise<GeneratedImage> {
  const width = input.width ?? 1024;
  const height = input.height ?? 1024;
  const model = input.model ?? "flux";

  let url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(input.prompt)}` +
    `?width=${width}&height=${height}&seed=${seed}&nologo=true&model=${model}&referrer=marketing-tool`;
  if (POLLINATIONS_TOKEN) url += `&token=${encodeURIComponent(POLLINATIONS_TOKEN)}`;

  const headers: Record<string, string> = { "User-Agent": "marketing-tool/1.0" };
  if (POLLINATIONS_TOKEN) headers["Authorization"] = `Bearer ${POLLINATIONS_TOKEN}`;

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2500 * attempt);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
    const contentType = res.headers.get("content-type") ?? "";
    if (res.ok && contentType.startsWith("image/")) {
      return { buffer: Buffer.from(await res.arrayBuffer()), contentType, seed };
    }
    lastErr = `${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`;
    if (res.status === 402 || res.status === 401) break; // hard gate — retry won't help
  }
  throw new Error(lastErr || "未知錯誤");
}

async function huggingFaceImage(input: GenerateImageInput, seed: number): Promise<GeneratedImage> {
  // HF moved serverless inference to the router host; the old api-inference host is gone.
  const url = `https://router.huggingface.co/hf-inference/models/${HF_IMAGE_MODEL}`;
  const body = JSON.stringify({
    inputs: input.prompt,
    parameters: { width: input.width ?? 1024, height: input.height ?? 1024 },
  });

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(4000 * attempt); // HF cold-start can take ~20s
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(90_000),
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (res.ok && contentType.startsWith("image/")) {
      return { buffer: Buffer.from(await res.arrayBuffer()), contentType, seed };
    }
    lastErr = `${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`;
    if (res.status !== 503) break; // only cold-start (503) is worth retrying
  }
  throw new Error(lastErr || "未知錯誤");
}

async function generateImageN8n(input: GenerateImageInput): Promise<GeneratedImage> {
  if (!N8N_WEBHOOK_URL) throw new Error("GEN_PROVIDER=n8n 但 N8N_WEBHOOK_URL 未設定");
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const res = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "image", ...input, seed }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`n8n image webhook 錯誤 ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  // Webhook may return raw image bytes, or JSON with {imageUrl} / {imageBase64}.
  if (contentType.startsWith("image/")) {
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType, seed };
  }
  const data = await res.json();
  if (data.imageBase64) {
    return { buffer: Buffer.from(data.imageBase64, "base64"), contentType: data.contentType ?? "image/png", seed };
  }
  if (data.imageUrl) {
    const imgRes = await fetch(data.imageUrl, { signal: AbortSignal.timeout(60_000) });
    return {
      buffer: Buffer.from(await imgRes.arrayBuffer()),
      contentType: imgRes.headers.get("content-type") ?? "image/png",
      seed,
    };
  }
  throw new Error("n8n image webhook 回應缺少 imageUrl / imageBase64");
}
