/**
 * OpenRouter image generation
 * Model: google/gemini-3-pro-image-preview
 *
 * Multimodal support: past post images are sent as visual style references
 * so Gemini can learn the brand's actual composition, color, and aesthetic.
 */

import { loadBuffer, saveBuffer, contentTypeForExt } from "@/lib/storage";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const IMAGE_MODEL = "google/gemini-3-pro-image-preview";

interface ImageItem {
  type: string;
  image_url?: { url: string };
}

interface OpenRouterResponse {
  choices?: {
    message?: {
      content: string | null;
      images?: ImageItem[];
    };
  }[];
  error?: { message: string };
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function toBase64DataUrl(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;  // 已是 data URL，直接回傳
    if (url.startsWith("/")) {
      const buf = await loadBuffer(url);
      const ext = url.split(".").pop() ?? "jpeg";
      const mime = contentTypeForExt(ext);
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
    if (url.startsWith("http")) {
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get("content-type") ?? "image/jpeg";
      return `data:${ct};base64,${buf.toString("base64")}`;
    }
  } catch (e) {
    console.warn("[openrouter] toBase64DataUrl failed:", e);
  }
  return null;
}

async function downloadAndSave(b64: string, ext: string, seed?: string): Promise<string> {
  return saveBuffer(Buffer.from(b64, "base64"), ext, `ai-${seed ?? Date.now()}-`);
}

// ── main export ───────────────────────────────────────────────────────────────

export async function generateImageOpenRouter(
  prompt: string,
  seed?: string,
  /** 過往貼文圖片（最多送 2 張給 Gemini 做視覺參考） */
  styleReferenceImages?: string[],
  /** 啟用文字燒入模式：在 system 層告訴模型產出帶排版的廣告圖 */
  useTextOverlay?: boolean,
  /** 圖片編輯模式：傳入現有圖片 URL，讓 Gemini 在這張圖上做修改 */
  baseImageUrl?: string,
  /** 產品參考圖（支援多張，最多 3 張）：告訴 Gemini 廣告主角產品長什麼樣 */
  productImageUrls?: string[],
  /** 版型類型：只輸出對應 Layout 的規則，避免三套規則互相干擾 */
  layoutType?: "A" | "B" | "C",
  /** 圖片比例（如 "9:16"）：透過 image_config.aspect_ratio 控制 Gemini 輸出尺寸 */
  aspectRatio?: string,
  /** 模型覆寫：不傳則用預設 IMAGE_MODEL（Gemini 3 Pro Image） */
  modelOverride?: string
): Promise<string> {
  const model = modelOverride || IMAGE_MODEL;
  const fallback = `https://picsum.photos/seed/${seed ?? "default"}/1024/1024`;
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.warn("[openrouter] No OPENROUTER_API_KEY — using placeholder");
    return fallback;
  }

  console.log(`[openrouter] Generating with ${model}…`);

  try {
    // 建立 multimodal content：先放風格參考圖，再放文字 prompt
    type ContentPart =
      | { type: "image_url"; image_url: { url: string } }
      | { type: "text"; text: string };

    const contentParts: ContentPart[] = [];

    // 圖片編輯模式：把 baseImage 放在最前面（IMAGE 1）
    if (baseImageUrl) {
      const baseDataUrl = await toBase64DataUrl(baseImageUrl);
      if (baseDataUrl) {
        contentParts.push({ type: "image_url", image_url: { url: baseDataUrl } });
        console.log("[openrouter] Added base image for editing (IMAGE 1)");
      }
      // baseImageUrl 模式下也允許加入 styleReferenceImages（IMAGE 2，風格參考）
      if (styleReferenceImages && styleReferenceImages.length > 0) {
        const refDataUrl = await toBase64DataUrl(styleReferenceImages[0]);
        if (refDataUrl) {
          contentParts.push({ type: "image_url", image_url: { url: refDataUrl } });
          console.log("[openrouter] Added style reference image alongside base image (IMAGE 2)");
        }
      }
    }

    // 產品參考圖（支援多張，最多 3 張，不與 baseImage 混用）
    const hasProductImages = !!(productImageUrls?.length && !baseImageUrl);
    if (hasProductImages) {
      const sliced = productImageUrls!.slice(0, 3);
      for (let i = 0; i < sliced.length; i++) {
        const dataUrl = await toBase64DataUrl(sliced[i]);
        if (dataUrl) {
          contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
          console.log(`[openrouter] Added product image ${i + 1}/${sliced.length}`);
        }
      }
    }

    // 加入風格參考圖（最多 2 張，不與 baseImage / productImages 混用）
    const refs = (baseImageUrl || hasProductImages)
      ? []
      : (styleReferenceImages ?? []).slice(0, 2);
    if (!baseImageUrl && !hasProductImages) {
      for (const refUrl of refs) {
        const dataUrl = await toBase64DataUrl(refUrl);
        if (dataUrl) {
          contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
          console.log("[openrouter] Added style reference image");
        }
      }
    }

    // 當 prompt 已包含完整指令（如 isStyleRef 模式），不加 editPrefix 避免干擾
    const editPrefix = (baseImageUrl && !prompt.includes("IMAGE 1"))
      ? "You are given an existing advertisement image. Modify it as instructed:\n\n"
      : "";

    const productCount = productImageUrls?.length ?? 0;

    // Layout A 規則：有產品圖時直接畫產品進去，沒產品圖才保留空白右側
    const layoutAProductRule = hasProductImages
      ? `**Layout A (Product Hero):**
- Center or slightly right-heavy composition with ALL ${productCount} product(s) as the hero
- Products arranged naturally on a clean surface: if multiple products, slight height variation and overlapping bases; if single product, centered with breathing room
- Left 40% = typography zone. The contrast for text comes from the NATURAL scene (a softly-lit wall, out-of-focus background, gentle vignette) — NOT from a solid color rectangle or flat panel pasted behind the text
- Right 50% = ALL ${productCount} product(s) placed on a clean surface (marble counter, stone platform), clearly visible and not cropped
- One consistent light source, cast shadows matching the surface
- The entire frame must read as ONE continuous photograph — no abrupt color-block edges anywhere`
      : `**Layout A (Product Hero):**
- Dead center or right-heavy composition, symmetrical balance, clean studio-adjacent background
- Left 45% = typography zone (pre-darkened/vignette naturally by scene lighting)
- RIGHT 45% = STRICTLY EMPTY flat surface — marble counter, wooden shelf, stone platform
- This right zone must look like a product photography surface, naturally lit, with subtle surface texture
- ABSOLUTELY NO product, bottle, object, or prop in the right zone`;

    // Layout B 規則：有產品圖時產品須出現在右側動態場景，沒產品圖才禁止產品
    const layoutBProductRule = hasProductImages
      ? `**Layout B (High Impact):**
- Dynamic, asymmetric, high-contrast composition with strong visual impact
- Left 45% = large bold typography. Achieve text contrast through dramatic scene lighting and shadow falloff (a naturally darker, shadowed part of the SAME scene) — NOT a solid color block, flat panel, or pasted-on colored rectangle behind the text
- Right 45% = ALL ${productCount} product(s) as the hero, shown at a dynamic 3/4 angle with dramatic side lighting and bold cast shadows
- Products must all be clearly visible and identifiable — do NOT crop or omit any product
- Optional: a hand/arm in motion interacting with the product, but the product packaging must stay fully visible
- The whole image is ONE continuous photographic scene with consistent lighting — no hard color-block edges dividing the frame
- Energy: kinetic and confident, like a Nike or Shiseido ULTIMUNE campaign`
      : `**Layout B (High Impact):**
- Dynamic composition, high contrast shadow, strong visual impact
- May include a hand, arm, or body part in action (applying product, water splashing) — but NO product bottle
- Left 45% = large bold typography taking up 35-40% of image height
- RIGHT 40% = empty surface or action scene without identifiable product packaging
- ABSOLUTELY NO product bottle or packaging in right zone`;

    // Layout C 規則：有產品時強調單一連貫場景，避免上下拼接感
    const layoutCProductRule = hasProductImages
      ? `**Layout C (Atmospheric Editorial):**
- ONE unified scene with consistent lighting, perspective, and color grading throughout the ENTIRE image — NO split backgrounds, NO patchwork compositions
- Camera angle: slightly elevated (15-25°), looking down at products on a textured surface (stone, marble, or weathered wood)
- The background behind and above the products naturally blurs into heavy bokeh — this bokeh zone at the top 40% of the frame IS the negative space for typography
- ALL ${productCount} product(s) placed in the lower-center or lower-right of the frame, resting naturally on the surface with cast shadows
- Lifestyle elements (flowers, leaves, branches) arranged AROUND the products in the same scene plane, same light source
- The entire image has ONE consistent light source (e.g. warm side light from the left) — shadows, highlights, and color temperature must match across all elements
- DO NOT create a separate sky/background panel above and a separate product table below — it must feel like ONE photograph taken from a single camera position`
      : `**Layout C (Atmospheric Editorial):**
- Rule of thirds, 50% negative space for typography in upper-left zone
- Cinematic atmosphere, heavy background bokeh, lifestyle props (flowers, towel, plant) are OK
- Lower-right 35% = clean surface where product will be placed in post-production
- ABSOLUTELY NO product bottle in the scene`;

    // 根據 layoutType 只輸出當前 Layout 的規則，避免三套規則互相干擾
    // layoutType 未傳入時才輸出全部（向下相容）
    const activeLayoutRule = layoutType === "A" ? layoutAProductRule
      : layoutType === "B" ? layoutBProductRule
      : layoutType === "C" ? layoutCProductRule
      : `${layoutAProductRule}\n\n${layoutBProductRule}\n\n${layoutCProductRule}`;

    // 有產品圖時不全面禁止產品出現，productPrefix 已有詳細規則
    const criticalProhibition = (hasProductImages)
      ? ``
      : `## CRITICAL PROHIBITION:
DO NOT place any product bottle, skincare container, pump dispenser, or packaging in this image.
The right/lower zone must be completely empty — a beautiful, naturally-lit surface awaiting post-production product compositing.
If you add any product or container, this output is REJECTED and must be regenerated.`;

    // 加入 prompt（文字燒入模式時加入設計師身份指令）
    const systemPrefix = useTextOverlay
      ? `You are a world-class commercial art director and photographer specializing in Asian beauty/lifestyle advertising. Your aesthetic references: Aesop, Jo Malone, SK-II, Shiseido campaign imagery.

## YOUR CORE AESTHETIC PRINCIPLES:

**Commercial Lighting (NOT flat/even light):**
- Beauty/skincare products: soft diffused window light from upper-left, warm golden hour tone, subtle rim light on product right edge
- Create depth through light falloff — bright subject, gradually darker toward edges

**Texture Realism (photographic, not AI-rendered):**
- Surfaces: marble grain visible under gloss, fabric micro-texture, each material rendered with its own true finish (matte stays matte, glossy stays glossy)
- Describe as if directing a real photographer: "captured on 85mm f/1.4, natural window light, shot on Phase One medium format"
- NEVER use: "ultra realistic", "hyperdetailed", "8K" — these trigger AI plasticity

**Editorial Negative Space:**
- MANDATORY: Reserve 40-50% of the frame as clean negative space for typography
- This space must be part of the scene's natural composition (a wall, a counter surface edge, an out-of-focus background zone) — NOT artificially blank

**Typography Integration (the most critical element):**
The text IS the ad — treat it as a core design element, not a label slapped on the image.

DESIGN PRINCIPLE: Every generation should feel visually distinct. Vary your approach:
- Try LARGE single-character decorative element (書、純、夏) behind the text at 8% opacity as texture
- Or split the headline into TWO weight contrasts: one word ultra-bold, the rest light/thin
- Or use a vertical text accent bar (2px colored line) on the left edge of the text block
- Or let the headline letters partially overlap the product for depth

HIERARCHY: Headline dominant (60-70% of text area height). Subtitle restrained — never compete with headline.

COLOR STRATEGY — choose based on what creates the strongest contrast with the background:
- Scene with warm stone/earth tones → white headline with warm amber or gold subtitle
- Scene with cool/blue tones → cream or warm white with thin subtitle
- Dark dramatic scene → bright white headline, colored accent on subtitle only
- Never use black text unless the entire background is pure white

LAYOUT VARIATION — pick ONE per generation, do not repeat the same layout:
Option 1: Left-aligned stacked, headline breaks into 2 lines naturally
Option 2: Large single headline word, subtitle on a separate visual plane (lower, smaller, different weight)
Option 3: Headline centered vertically on the text zone, subtitle below with generous spacing

BREATHING ROOM: Text never touches the frame edge. Padding = at least 8% of image width.

## LAYOUT-SPECIFIC RULES:

${activeLayoutRule}

${criticalProhibition}

\n\n`
      : "";
    const productPrefix = hasProductImages
      ? `PRODUCT IDENTITY — CRITICAL RULES:
The ${productCount} image(s) sent above show the EXACT physical product(s) to feature in this advertisement. Use them as the primary visual ground truth.

## WHAT YOU ARE FREE TO DO (creative latitude):
- Change the camera angle: show the product from a 3/4 view, slight tilt, top-down, or low angle
- Change the lighting direction and quality (dramatic side light, soft window light, rim light) — but keep it consistent, even studio-quality lighting so color judgments stay reliable
- Show the product rotated up to 45° for a more dynamic composition
- Slightly adjust scale or position to fit the layout composition
- Add natural reflections, cast shadows, or surface gloss consistent with the scene and the product's actual material

## WHAT YOU MUST NEVER CHANGE (brand identity — non-negotiable):
1. BRAND NAME & LOGO: The brand name and logo on the label must be legible and IDENTICAL to the reference — exact spelling, exact characters. Do NOT invent, replace, paraphrase, or omit the brand name.
2. OVERALL SILHOUETTE: The bottle/packaging shape (tall vs. short, wide vs. narrow, round vs. angular) must match. Do NOT change proportions by more than 10%.
3. COLOR PALETTE (ALL colors, not just primary): Match every color visible on the packaging — primary color, secondary/accent colors, and any gradient transitions. If the reference shows a two-tone design or a gradient (e.g. pink fading to white), reproduce the SAME color stops in the SAME positions. Do NOT simplify a gradient into a flat color, and do NOT simplify a two-tone design into a single color. Judge color under neutral, even studio lighting so shadows/warm light don't get mistaken for a color shift.
4. CAP / PUMP / CLOSURE TYPE: If the reference shows a pump dispenser, show a pump — not a cap. Match the closure type, color, and material exactly.
5. PRODUCT COUNT: Show exactly ${productCount} product(s) — the same number as in the reference images. No additional products in foreground, background, or reflections.
6. MATERIAL & SURFACE FINISH: Match the exact material appearance of the reference — glass vs. plastic vs. metal, and glossy vs. matte vs. frosted/satin finish. A glossy glass bottle must stay glossy glass; a matte plastic tube must stay matte plastic. Do NOT change how light interacts with the surface material.
7. SECONDARY LABEL TEXT: Beyond the brand name, preserve all other legible text elements — product name/variant, volume (e.g. "50ml"), and any tagline text — keeping the same layout, color blocks, and typography style as the reference. This text does not need to be pixel-perfect at small sizes, but must remain present, legible, and positioned in roughly the same place. Do NOT remove, blank out, or replace it with placeholder/gibberish text.

## PRIORITY (if any constraints conflict, resolve in this order):
1. Correct product count
2. Accurate closure type and silhouette
3. Brand name/logo fidelity
4. Color palette fidelity (primary + secondary + gradients)
5. Material/finish accuracy
6. Secondary label text legibility

## FAILURE CONDITIONS (output will be rejected if any of these occur):
- Product looks like a DIFFERENT brand or a generic substitute
- Brand name / logo is missing, blurred, misspelled, or replaced
- Bottle shape is drastically different (e.g., reference is tall & slim → output is short & wide)
- Color is completely wrong, or a two-tone/gradient design is flattened into a single solid color
- Material/finish is wrong (e.g., reference is frosted matte → output is clear glossy, or vice versa)
- Secondary label text (product name, volume, tagline) is missing, blank, or replaced with unreadable text
- Fewer or more products shown than the number of reference images provided (e.g. 3 images sent → must show exactly 3 products)

Think of yourself as a commercial photographer: you choose the angle and light, but the client's product — with its exact branding — must be instantly recognizable.\n\n`
      : "";

    const fullPrompt = refs.length > 0
      ? `${productPrefix}${systemPrefix}These images show the brand's visual style. Generate a new image in the SAME visual aesthetic, composition style, color grading, and atmosphere as these reference images.\n\n${prompt}`
      : `${productPrefix}${editPrefix}${systemPrefix}${prompt}`;

    contentParts.push({ type: "text", text: fullPrompt });

    const content = contentParts.length === 1 ? fullPrompt : contentParts;

    // seed 內含 activityId-layoutType，作為 log 標籤
    const tag = seed ?? "default";
    const imageCount = contentParts.filter((p) => p.type === "image_url").length;
    const promptLen = fullPrompt.length;
    console.log(`[openrouter][${tag}] payload: ${imageCount} image(s), prompt ${promptLen} chars, model ${model}`);

    // 比例 → Gemini 支援的 aspect_ratio（4:5 不在原生清單，對應到最接近的 3:4）
    const GEMINI_RATIOS: Record<string, string> = {
      "1:1": "1:1", "4:3": "4:3", "3:4": "3:4", "16:9": "16:9",
      "9:16": "9:16", "3:2": "3:2", "2:3": "2:3", "21:9": "21:9",
      "4:5": "3:4",  // 4:5 → 最接近的直式
    };
    const geminiAspectRatio = aspectRatio ? GEMINI_RATIOS[aspectRatio] : undefined;
    if (aspectRatio) {
      console.log(`[openrouter][${tag}] aspect_ratio=${geminiAspectRatio ?? "(unsupported→default 1:1)"} (requested ${aspectRatio})`);
    }

    // ── 重試迴圈：最多嘗試 3 次（1 次原始 + 2 次重試），失敗才降級 ──
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://marketing-tool.local",
            "X-Title": "Marketing Tool",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content }],
            max_tokens: 4096,
            modalities: ["image", "text"],
            ...(geminiAspectRatio
              ? { image_config: { aspect_ratio: geminiAspectRatio } }
              : {}),
          }),
        });

        const rawBody = await res.text();
        let data: OpenRouterResponse;
        try {
          data = JSON.parse(rawBody) as OpenRouterResponse;
        } catch {
          console.error(`[openrouter][${tag}] attempt ${attempt}/${MAX_ATTEMPTS} — non-JSON response (status ${res.status}): ${rawBody.slice(0, 500)}`);
          throw new Error("non-JSON response");
        }

        if (!res.ok || data.error) {
          console.error(
            `[openrouter][${tag}] attempt ${attempt}/${MAX_ATTEMPTS} FAILED\n` +
            `  HTTP status : ${res.status}\n` +
            `  error.message: ${data.error?.message ?? "(none)"}\n` +
            `  body        : ${rawBody.slice(0, 800)}`
          );
          throw new Error(`API error ${res.status}`);
        }

        const images = data.choices?.[0]?.message?.images ?? [];
        const b64Url = images.find((img) => img.type === "image_url")?.image_url?.url ?? "";
        const m = b64Url.match(/^data:image\/(\w+);base64,([\s\S]+)/);

        if (!m) {
          console.error(
            `[openrouter][${tag}] attempt ${attempt}/${MAX_ATTEMPTS} — no image in response.\n` +
            `  finish_reason: ${(data.choices?.[0] as { finish_reason?: string })?.finish_reason ?? "?"}\n` +
            `  text content : ${(data.choices?.[0]?.message?.content ?? "").slice(0, 300)}`
          );
          throw new Error("no image in response");
        }

        const localUrl = await downloadAndSave(m[2], m[1], seed);
        console.log(`[openrouter][${tag}] ✅ Saved (attempt ${attempt}): ${localUrl}`);
        return localUrl;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 餘額/權限類錯誤重試也沒用，直接降級
        if (msg.includes("insufficient") || msg.includes("credit") || msg.includes("402")) {
          console.error(`[openrouter][${tag}] credit/permission error — skipping retries`);
          break;
        }
        if (attempt < MAX_ATTEMPTS) {
          const delayMs = attempt * 1500; // 1.5s, 3s 漸進延遲
          console.warn(`[openrouter][${tag}] retrying in ${delayMs}ms… (${msg})`);
          await new Promise((r) => setTimeout(r, delayMs));
        } else {
          console.error(`[openrouter][${tag}] all ${MAX_ATTEMPTS} attempts failed → fallback`);
        }
      }
    }

    return fallback;

  } catch (err) {
    console.error("[openrouter] Error:", err);
    return fallback;
  }
}

// ── Text / Vision chat completions ─────────────────────────────────────────────
// 活動圖生成（文案 / 風格分析 / 讀圖）改用 OpenRouter，唔再靠獨立 ANTHROPIC_API_KEY。
const TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL ?? "openai/gpt-4o-mini";
const VISION_MODEL = process.env.OPENROUTER_VISION_MODEL ?? "openai/gpt-4o-mini";

interface ChatResponse { choices?: { message?: { content: string | null } }[]; error?: { message: string } }

async function orChat(model: string, content: unknown, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://marketing-tool.local",
        "X-Title": "Marketing Tool",
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content }], max_tokens: maxTokens }),
    });
    const data = (await res.json()) as ChatResponse;
    if (!res.ok || data.error) {
      console.warn(`[openrouter:chat] ${model} failed:`, data.error?.message ?? res.status);
      return null;
    }
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    console.warn("[openrouter:chat] error:", e);
    return null;
  }
}

/** 純文字 completion（文案 / 合併風格描述）。*/
export async function chatTextOpenRouter(prompt: string, maxTokens = 500): Promise<string | null> {
  return orChat(TEXT_MODEL, prompt, maxTokens);
}

/** 讀圖描述（vision）。imageUrl 可為 data: 或 http URL。*/
export async function describeImageOpenRouter(imageUrl: string, prompt: string, maxTokens = 200): Promise<string | null> {
  return orChat(VISION_MODEL, [
    { type: "image_url", image_url: { url: imageUrl } },
    { type: "text", text: prompt },
  ], maxTokens);
}
