import { NextResponse } from "next/server";
import { editImageFal, eraseImageFal } from "@/lib/fal";
import { generateImageOpenRouter } from "@/lib/openrouter";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

export const maxDuration = 120;

// ── 偵測加文字意圖 ────────────────────────────────────────────────────────────
const ADD_TEXT_PATTERNS = [
  /加[上入](.{1,20})文字/,
  /加[上入]文字[「"'](.{1,20})[」"']/,
  /加[上入][「"'](.{1,20})[」"']/,
  /寫[上入](.{1,20})/,
  /放[上](.{1,20})文字/,
  /顯示[「"'](.{1,20})[」"']/,
  /文字[「"'](.{1,20})[」"']/,
  /[「"'](.{1,20})[」"'].*文字/,
];

function extractTextToAdd(prompt: string): string | null {
  for (const pattern of ADD_TEXT_PATTERNS) {
    const m = prompt.match(pattern);
    if (m?.[1]) return m[1].trim();
  }
  // 如果 prompt 裡有引號包起來的內容也抓
  const quoted = prompt.match(/[「"'"](.{1,30})[」"'"]/);
  if (quoted?.[1] && /加|加上|寫|放|顯示/.test(prompt)) return quoted[1].trim();
  return null;
}

// ── Sharp 疊加文字（不走 AI，直接燒入）───────────────────────────────────────
async function addTextToImage(
  imageUrl: string,
  text: string,
  bounds?: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const uploadsDir = join(process.cwd(), "public/uploads");
  await mkdir(uploadsDir, { recursive: true });

  const imgBuf = imageUrl.startsWith("/")
    ? await readFile(join(process.cwd(), "public", imageUrl))
    : Buffer.from(await (await fetch(imageUrl)).arrayBuffer());

  const meta = await sharp(imgBuf).metadata();
  const W = meta.width  ?? 1024;
  const H = meta.height ?? 1024;

  // 計算文字位置（有 bounds 則放在 bounds 中心，否則放頂部）
  const textX = bounds ? Math.floor((bounds.x + bounds.width  / 2) * W) : Math.floor(W / 2);
  const textY = bounds ? Math.floor((bounds.y + bounds.height / 2) * H) : Math.floor(H * 0.12);

  const fontSize = Math.max(36, Math.floor(W / 14));
  const padding  = Math.floor(fontSize * 0.5);

  // 估算文字寬度（中文每字約 fontSize px）
  const textW = text.length * fontSize + padding * 2;
  const textH = fontSize + padding * 2;

  const svgX = Math.max(0, textX - textW / 2);
  const svgY = Math.max(0, textY - textH / 2);

  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${svgX}" y="${svgY}" width="${textW}" height="${textH}"
        fill="rgba(0,0,0,0.55)" rx="8"/>
  <text
    x="${textX}" y="${svgY + textH * 0.72}"
    font-family="'PingFang SC','Noto Sans CJK TC','Microsoft YaHei',Arial,sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    fill="white"
    text-anchor="middle"
    dominant-baseline="auto"
  >${text}</text>
</svg>`.trim();

  const result = await sharp(imgBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  const filename = `ai-text-${Date.now()}.jpg`;
  await writeFile(join(uploadsDir, filename), result);
  return `/uploads/${filename}`;
}

// ── 品牌 Logo 疊加（讀取真實 logo，不讓 AI 生成）─────────────────────────────

const LOGO_INTENT_PATTERNS = [
  /加[上入].{0,6}(品牌)?\s*logo/i,
  /放[上入]?.{0,6}(品牌)?\s*logo/i,
  /(品牌)?\s*logo\s*(加上|放上|加入)/i,
  /加.{0,4}商標/,
  /放.{0,4}商標/,
];

function detectLogoIntent(prompt: string): boolean {
  return LOGO_INTENT_PATTERNS.some((p) => p.test(prompt));
}

type LogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-center";

function extractLogoPosition(prompt: string): LogoPosition {
  if (/左上/.test(prompt)) return "top-left";
  if (/右上/.test(prompt)) return "top-right";
  if (/左下/.test(prompt)) return "bottom-left";
  if (/右下/.test(prompt)) return "bottom-right";
  if (/(上方)?(置中|中間|中央)/.test(prompt) && /上/.test(prompt)) return "top-center";
  if (/top.?left/i.test(prompt)) return "top-left";
  if (/top.?right/i.test(prompt)) return "top-right";
  if (/bottom.?left/i.test(prompt)) return "bottom-left";
  if (/bottom.?right/i.test(prompt)) return "bottom-right";
  if (/top.?center/i.test(prompt)) return "top-center";
  return "top-left";
}

async function getBrandLogoPath(directUrl?: string): Promise<string | null> {
  // 最優先：前端直接傳來的 logo URL（來自 Client.logoUrl）
  if (directUrl) {
    console.log(`[logo] Using directly provided brandLogoUrl: ${directUrl}`);
    return directUrl;
  }

  // a. 嘗試讀取 public/brand-settings.json
  try {
    const raw = await readFile(join(process.cwd(), "public", "brand-settings.json"), "utf-8");
    const settings = JSON.parse(raw) as { logoUrl?: string; logo?: string };
    const url = settings.logoUrl ?? settings.logo;
    if (url) {
      console.log(`[logo] Found logo in brand-settings.json: ${url}`);
      return url;
    }
  } catch { /* 檔案不存在或格式錯誤 → 繼續 */ }

  // b. 掃描 public/uploads/ 找名稱含 "logo" 的圖片檔
  try {
    const { readdir } = await import("fs/promises");
    const files = await readdir(join(process.cwd(), "public", "uploads"));
    const logoFile = files.find(
      (f) => /logo/i.test(f) && /\.(png|jpe?g|webp)$/i.test(f)
    );
    if (logoFile) {
      console.log(`[logo] Found logo file in uploads: ${logoFile}`);
      return `/uploads/${logoFile}`;
    }
  } catch { /* 目錄不存在 → 繼續 */ }

  // c. 都找不到
  return null;
}

async function addLogoToImage(
  imageUrl: string,
  logoPath: string,
  position: LogoPosition,
  bounds?: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const uploadsDir = join(process.cwd(), "public/uploads");
  await mkdir(uploadsDir, { recursive: true });

  const imgBuf = imageUrl.startsWith("/")
    ? await readFile(join(process.cwd(), "public", imageUrl))
    : Buffer.from(await (await fetch(imageUrl)).arrayBuffer());

  const logoBuf = logoPath.startsWith("/")
    ? await readFile(join(process.cwd(), "public", logoPath))
    : Buffer.from(await (await fetch(logoPath)).arrayBuffer());

  const meta = await sharp(imgBuf).metadata();
  const W = meta.width  ?? 1024;
  const H = meta.height ?? 1024;

  // logo 最大寬度 = 圖片寬度 25%
  const maxLogoW = Math.floor(W * 0.25);
  const logoResized = await sharp(logoBuf)
    .resize({ width: maxLogoW, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  const lMeta = await sharp(logoResized).metadata();
  const lw = lMeta.width  ?? maxLogoW;
  const lh = lMeta.height ?? maxLogoW;

  const margin = Math.floor(W * 0.04);

  let left: number, top: number;
  if (bounds) {
    // 放在 bounds 中心
    left = Math.floor((bounds.x + bounds.width  / 2) * W - lw / 2);
    top  = Math.floor((bounds.y + bounds.height / 2) * H - lh / 2);
  } else {
    switch (position) {
      case "top-right":     left = W - lw - margin;            top = margin;          break;
      case "bottom-left":   left = margin;                     top = H - lh - margin; break;
      case "bottom-right":  left = W - lw - margin;            top = H - lh - margin; break;
      case "top-center":    left = Math.floor((W - lw) / 2);   top = margin;          break;
      default:              left = margin;                     top = margin;          // top-left
    }
  }
  left = Math.max(0, Math.min(left, W - lw));
  top  = Math.max(0, Math.min(top,  H - lh));

  const result = await sharp(imgBuf)
    .composite([{ input: logoResized, left, top }])
    .jpeg({ quality: 95 })
    .toBuffer();

  const filename = `ai-logo-${Date.now()}.jpg`;
  await writeFile(join(uploadsDir, filename), result);
  console.log(`[logo] ✅ Logo added at ${position} (${left},${top}): /uploads/${filename}`);
  return `/uploads/${filename}`;
}

// ── 字體更改（Gemini AI，鎖定文字內容只換字型）───────────────────────────────

const FONT_MAP: Record<string, string> = {
  "宋體": "traditional Chinese serif, thin horizontal strokes, thick vertical strokes, classical elegant",
  "明體": "Ming/Song typeface, classical Chinese print style, sharp serifs",
  "黑體": "bold uniform-stroke Gothic sans-serif, modern and strong",
  "圓體": "rounded corner sans-serif, friendly and soft",
  "楷體": "Chinese regular script calligraphy, brush-like strokes",
};

function extractFontChange(prompt: string): { fontName: string; cssDescription: string } | null {
  const m = prompt.match(/(?:字體|字型)?(?:改成|換成|改為|換為|用)\s*([一-鿿]{1,4}體)\s*(?:字體|字型)?/);
  if (!m?.[1]) return null;
  const name = m[1];
  const cssDescription = FONT_MAP[name] ?? `${name} style Chinese typeface`;
  return { fontName: name, cssDescription };
}

async function extractTextFromImage(imageUrl: string): Promise<string | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const imgBuf = imageUrl.startsWith("/")
      ? await readFile(join(process.cwd(), "public", imageUrl))
      : Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
    const ext  = imageUrl.split(".").pop()?.toLowerCase() ?? "jpg";
    const mime = ext === "png" ? "image/png" : "image/jpeg";

    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime as "image/jpeg" | "image/png", data: imgBuf.toString("base64") } },
          { type: "text", text: "List ALL text visible in this image exactly as written, one line per text block. Output ONLY the raw text content." },
        ],
      }],
    });
    const text = (res.content[0] as { text: string }).text.trim();
    return text || null;
  } catch (e) {
    console.warn("[fontChange] extractTextFromImage failed:", e);
    return null;
  }
}

// ── 文字內容替換偵測（「標題改成X」「文案改成：X」）──────────────────────────
function extractTextReplacement(prompt: string): string | null {
  const patterns = [
    // 「文案/文字/標題...」+ 「改成/換成」+ 冒號（全形半形）+ 新內容
    /(?:文案|文字|標題|主標題|副標題|字幕|內容|字)\s*(?:改成|換成|改為|換為|替換成|替換為|替換)\s*[：:「『"'“”]?\s*(.+)/,
    // 直接「改成/換成」+「引號包住的內容」
    /(?:改成|換成|改為|換為|替換成|替換為)\s*[「『"'“](.+?)[」』"'”]/,
    // 直接「改成/換成」+ 無引號內容（至少2字）
    /(?:改成|換成|改為|換為)\s*[:：]?\s*(.{2,})/,
  ];

  // 「背景改成…」「顏色換成…」是場景編輯不是文字替換 → 交給 Case 3 Kontext
  if (/(?:背景|場景|顏色|色調|底色|風格)\s*(?:改成|換成|改為|換為)/.test(prompt)) return null;

  for (const p of patterns) {
    const m = prompt.match(p);
    let t = m?.[1]?.trim();
    if (t) {
      // 去掉殘留的結尾引號（pattern 1 的貪婪匹配會吃到收尾引號）
      t = t.replace(/[」』"'”]+$/, "").trim();
      // 排除字體更改（純漢字 + 體，4 字以內）— 那由 Case 0.7 處理
      if (/^[一-鿿]{1,4}體$/.test(t)) continue;
      // 排除太短或只有標點
      if (t.length < 2) continue;
      return t;
    }
  }
  return null;
}

// ── 精確區域擦除（從 selectionBounds 產生遮罩，走 flux fill）─────────────────
async function eraseRegion(
  imageUrl: string,
  bounds: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const uploadsDir = join(process.cwd(), "public/uploads");
  await mkdir(uploadsDir, { recursive: true });

  const imgBuf = imageUrl.startsWith("/")
    ? await readFile(join(process.cwd(), "public", imageUrl))
    : Buffer.from(await (await fetch(imageUrl)).arrayBuffer());

  const meta = await sharp(imgBuf).metadata();
  const W = meta.width  ?? 1024;
  const H = meta.height ?? 1024;

  // 白色矩形 = 修改區，黑色背景 = 保留區
  const maskX = Math.floor(bounds.x      * W);
  const maskY = Math.floor(bounds.y      * H);
  const maskW = Math.max(1, Math.ceil(bounds.width  * W));
  const maskH = Math.max(1, Math.ceil(bounds.height * H));

  // ── 模糊填充法：對整張圖做高強度 blur，取出選框區域貼回原圖 ──────────────
  // 周圍顏色自然擴散進選框，天空/漸層背景效果最佳
  const blurRadius = Math.max(20, Math.floor(Math.min(maskW, maskH) * 0.4));

  // 1. 整張圖強模糊 → 取出選框區域作為「填充色」
  const blurredFull = await sharp(imgBuf).blur(blurRadius).toBuffer();
  const fillPatch = await sharp(blurredFull)
    .extract({ left: maskX, top: maskY, width: maskW, height: maskH })
    .toBuffer();

  // 2. 為了讓邊緣更自然，建立一個帶羽化遮罩的 SVG overlay
  //    中心不透明（填充色），邊緣漸層到透明（保留原圖）
  const feather = Math.max(4, Math.floor(Math.min(maskW, maskH) * 0.08));
  const featherSvg = `<svg width="${maskW}" height="${maskH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="fg" cx="50%" cy="50%" r="50%">
      <stop offset="60%" stop-color="white" stop-opacity="1"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${maskW}" height="${maskH}" fill="url(#fg)"/>
</svg>`;

  // 3. 貼上帶羽化遮罩的填充
  const featheredPatch = await sharp(fillPatch)
    .composite([{
      input: Buffer.from(featherSvg),
      blend: "dest-in",
    }])
    .png()
    .toBuffer();

  // 4. 合成回原圖
  const result = await sharp(imgBuf)
    .composite([{ input: featheredPatch, left: maskX, top: maskY, blend: "over" }])
    .jpeg({ quality: 95 })
    .toBuffer();

  const filename = `ai-erase-${Date.now()}.jpg`;
  await writeFile(join(uploadsDir, filename), result);
  console.log(`[erase] ✅ blur-fill done: /uploads/${filename}`);
  return `/uploads/${filename}`;
}

// ── 精確局部擦除（Nano Banana Pro / Gemini，語意理解移除文字）──────────────
async function eraseRegionWithAI(
  imageUrl: string,
  bounds: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const imgBuf = imageUrl.startsWith("/")
    ? await readFile(join(process.cwd(), "public", imageUrl))
    : Buffer.from(await (await fetch(imageUrl)).arrayBuffer());

  const meta = await sharp(imgBuf).metadata();

  // bounds → 百分比描述，讓 Gemini 知道在哪個位置
  const x1 = Math.round(bounds.x * 100);
  const y1 = Math.round(bounds.y * 100);
  const x2 = Math.round((bounds.x + bounds.width)  * 100);
  const y2 = Math.round((bounds.y + bounds.height) * 100);
  const areaHint = boundsToAreaHint(bounds) ?? "selected area";

  // 原圖 → base64 data URL（直接傳給 Gemini）
  const ext     = imageUrl.split(".").pop()?.toLowerCase() ?? "jpg";
  const mime    = ext === "png" ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mime};base64,${imgBuf.toString("base64")}`;

  const erasePrompt =
    `You are given an image. Your task is EXTREMELY specific and limited:` +
    `\n\nSTEP 1 - IDENTIFY the rectangular region: ` +
    `from ${x1}% to ${x2}% from the left edge, and from ${y1}% to ${y2}% from the top edge of the image.` +
    `\n\nSTEP 2 - PRESERVE EVERYTHING outside this rectangle EXACTLY as-is: ` +
    `every pixel, every text character, every color, every object outside the rectangle must remain 100% identical.` +
    `\n\nSTEP 3 - ONLY within that specific rectangle: ` +
    `remove any text or typography that appears inside the rectangle, ` +
    `and fill the space with the natural background texture, color, and lighting ` +
    `that matches the surrounding area seamlessly.` +
    `\n\nDO NOT touch anything outside the specified rectangle. ` +
    `DO NOT remove any text that is outside the rectangle boundaries. ` +
    `Output the complete image with ONLY that small rectangular area modified.`;

  console.log(
    `[eraseRegionWithAI] Gemini erase: bounds px=(${
      Math.round(bounds.x * (meta.width ?? 1024))},${
      Math.round(bounds.y * (meta.height ?? 1024))}) ` +
    `size=(${Math.round(bounds.width * (meta.width ?? 1024))}×${
      Math.round(bounds.height * (meta.height ?? 1024))}) ` +
    `pct=(${x1}%,${y1}% → ${x2}%,${y2}%)`
  );

  try {
    const resultUrl = await generateImageOpenRouter(
      erasePrompt,
      `erase-${Date.now()}`,
      undefined,   // styleReferenceImages
      false,       // useTextOverlay
      dataUrl,     // baseImageUrl — 原圖傳給 Gemini 在上面編輯
      undefined    // productImageUrl
    );
    return resultUrl;
  } catch (e) {
    console.warn("[eraseRegionWithAI] OpenRouter failed, fallback to blur:", e);
    return eraseRegion(imageUrl, bounds);
  }
}

// ── 有參考圖的 Gemini multimodal 編輯 ────────────────────────────────────────
async function editWithReferenceImage(opts: {
  imageUrl: string;
  referenceImageDataUrl: string;
  prompt: string;
  selectionBounds?: { x: number; y: number; width: number; height: number };
}): Promise<string> {
  const { imageUrl, referenceImageDataUrl, prompt, selectionBounds } = opts;

  const imgBuf = imageUrl.startsWith("/")
    ? await readFile(join(process.cwd(), "public", imageUrl))
    : Buffer.from(await (await fetch(imageUrl)).arrayBuffer());

  const ext  = imageUrl.split(".").pop()?.toLowerCase() ?? "jpg";
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  const baseDataUrl = `data:${mime};base64,${imgBuf.toString("base64")}`;

  // 偵測是否為「文字風格參考」意圖
  const STYLE_REF_KEYWORDS = [
    "風格", "字體", "字型", "文字風格", "排版", "樣式", "style",
    "typography", "font", "text style", "文字樣式", "參考文字",
  ];
  const isStyleRef = STYLE_REF_KEYWORDS.some((kw) =>
    prompt.toLowerCase().includes(kw.toLowerCase())
  );

  let finalPrompt: string;

  if (isStyleRef) {
    // 給 Gemini 排版自由度，但鎖定人物/背景/構圖
    finalPrompt =
      `IMPORTANT: Output image must be square (1:1 aspect ratio), same dimensions as IMAGE 1.\n\n` +
      `You are a professional Korean beauty advertisement designer.\n\n` +
      `You have TWO images:\n` +
      `- IMAGE 1: Current advertisement to redesign the typography\n` +
      `- IMAGE 2: Typography style inspiration\n\n` +
      `YOUR TASK: Redesign the Chinese text in IMAGE 1 to match the visual aesthetic of IMAGE 2.\n\n` +
      `TYPOGRAPHY REDESIGN RULES:\n` +
      `- Study IMAGE 2's text: font style, color (gold gradient/metallic/glowing), weight, shadow effects\n` +
      `- Apply that same visual treatment to the Chinese text in IMAGE 1\n` +
      `- You MAY adjust text size, position, and layout to look beautiful and well-composed\n` +
      `- The Chinese text CONTENT must stay identical (same characters, same meaning)\n` +
      `- Make it look like a premium professional beauty advertisement\n\n` +
      `WHAT MUST STAY THE SAME:\n` +
      `- The person (face, body, pose, skin) — pixel identical\n` +
      `- The product (cream jar, innisfree branding)\n` +
      `- The background scene (bathroom, plants, lighting)\n` +
      `- Overall image dimensions and aspect ratio\n\n` +
      `DESIGN PHILOSOPHY:\n` +
      `- Text should be elegantly placed — not cut off, not overlapping the face\n` +
      `- Use the available space beautifully (left area, top area, or wherever fits)\n` +
      `- The result should look like it came from a professional design agency\n` +
      `- If IMAGE 2 has gold metallic text → apply gold metallic treatment to the Chinese characters`;
  } else {
    // 一般參考圖（產品替換）→ Gemini multimodal，能同時看到廣告圖和參考產品圖
    const areaHint = boundsToAreaHint(selectionBounds);
    const locationHint = areaHint ? `The product to replace is in the ${areaHint} area. ` : "";
    const userIntent = prompt?.trim()
      ? (/[一-鿿]/.test(prompt) ? (await translateToEnglish(prompt) ?? prompt) : prompt)
      : "";

    finalPrompt =
      `TASK: Replace the product in IMAGE 1 (the advertisement) with the product shown in IMAGE 2 (the reference).\n\n` +
      (locationHint ? `LOCATION: ${locationHint}\n\n` : "") +
      (userIntent   ? `USER INSTRUCTION: ${userIntent}\n\n` : "") +
      `PRODUCT REPLACEMENT RULES:\n` +
      `- Study IMAGE 2 carefully: brand name, bottle shape, color, label, cap/pump design\n` +
      `- Replace the product in IMAGE 1 with the EXACT product from IMAGE 2 — same brand, color, shape, label text\n` +
      `- Place the replacement product at the EXACT SAME POSITION as the original product in IMAGE 1\n` +
      `- The replacement product must occupy the SAME SIZE AND AREA as the original product\n` +
      `- Match the perspective angle so the new product fits naturally in the scene\n\n` +
      `MUST NOT CHANGE:\n` +
      `- Output canvas dimensions and aspect ratio (same size as IMAGE 1)\n` +
      `- Background, props, environment, lighting\n` +
      `- ALL text and typography (headline, subtitle — pixel identical, do NOT touch)\n` +
      `- Shadows and color grading of the scene\n\n` +
      `OUTPUT: Same advertisement as IMAGE 1, but with the product replaced by the product from IMAGE 2.`;
  }

  // 1. 取得原圖尺寸（先取得，才能在 prompt 裡告訴 Gemini 目標尺寸）
  const origMeta = await sharp(imgBuf).metadata();
  const origW = origMeta.width  ?? 1024;
  const origH = origMeta.height ?? 1024;
  const origRatio = origW / origH;
  const orientation = origW >= origH ? "landscape" : "portrait";

  // 把尺寸資訊加進兩種 prompt（讓 Gemini 知道輸出要維持原始比例）
  const sizeInstruction =
    `\nCRITICAL OUTPUT SIZE: The output image must maintain the SAME aspect ratio as IMAGE 1 ` +
    `(${origW}×${origH}, ${orientation} orientation, ratio ${origRatio.toFixed(2)}:1). ` +
    `Do NOT output a square image. Keep the same ${orientation} proportions.`;
  finalPrompt += sizeInstruction;

  console.log(`[editWithRef] isStyleRef=${isStyleRef} size=${origW}×${origH} prompt="${finalPrompt.slice(0, 100)}"`);

  // 2. 呼叫 Gemini（需要同時看兩張圖：廣告圖 + 參考產品/風格圖）
  const resultUrl = await generateImageOpenRouter(
    finalPrompt,
    `ref-edit-${Date.now()}`,
    [referenceImageDataUrl],
    false,
    baseDataUrl,
    undefined
  );

  // 3. 縮放回原始尺寸：
  //    - 比例接近（誤差 <8%）→ fit:fill（微量拉伸，幾乎看不出來）
  //    - 比例差很多（Gemini 輸出正方形）→ fit:cover + 置中裁切（裁邊比壓扁好看）
  try {
    const uploadsDir = join(process.cwd(), "public/uploads");
    await mkdir(uploadsDir, { recursive: true });

    const localResultBuf = await readFile(join(process.cwd(), "public", resultUrl));
    const resultMeta = await sharp(localResultBuf).metadata();
    const resultRatio = (resultMeta.width ?? origW) / (resultMeta.height ?? origH);
    const ratioDiff = Math.abs(resultRatio - origRatio) / origRatio;

    const fitMode = ratioDiff < 0.08 ? "fill" : "cover";
    console.log(`[editWithRef] result ratio=${resultRatio.toFixed(2)}, orig=${origRatio.toFixed(2)}, diff=${(ratioDiff*100).toFixed(1)}% → fit:${fitMode}`);

    const resizedBuf = await sharp(localResultBuf)
      .resize(origW, origH, {
        fit: fitMode,
        position: "centre",  // cover 時從中心裁，避免切掉頂部文字或底部產品
      })
      .jpeg({ quality: 95 })
      .toBuffer();

    const resizedFilename = `ai-resized-${Date.now()}.jpg`;
    await writeFile(join(uploadsDir, resizedFilename), resizedBuf);
    console.log(`[editWithRef] ✅ Resized to ${origW}×${origH}: /uploads/${resizedFilename}`);
    return `/uploads/${resizedFilename}`;
  } catch (e) {
    console.warn("[editWithRef] Resize failed, returning original result:", e);
    return resultUrl;
  }
}

// ── 中文 → 英文 ───────────────────────────────────────────────────────────────
async function translateToEnglish(chinesePrompt: string): Promise<string | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 80,
      messages: [{
        role: "user",
        content: `Translate this image editing instruction to concise English (max 20 words). Return only the translation:\n"${chinesePrompt}"`,
      }],
    });
    const translated = (res.content[0] as { text: string }).text.trim();
    console.log(`[inpaint] Translated: "${chinesePrompt}" → "${translated}"`);
    return translated;
  } catch { return null; }
}

// ── Prompt routing ────────────────────────────────────────────────────────────

const ERASE_KEYWORDS = [
  "移除","擦除","去掉","刪除","塗掉","消掉","擦掉","除掉","清除","抹掉",
  "remove","erase","delete","clean up","wipe",
];
const MARKETING_LABEL_REGEX = /^(主標題|副標題|標題|品牌名|slogan|cta)[：:「"'\s]/i;

function boundsToAreaHint(b?: { x:number;y:number;width:number;height:number }): string | undefined {
  if (!b) return undefined;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const v  = cy < 0.35 ? "upper" : cy > 0.65 ? "lower" : "middle";
  const h  = cx < 0.35 ? "left"  : cx > 0.65 ? "right"  : "center";
  return `${v} ${h}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const {
      imageUrl,
      prompt: rawPrompt,
      selectionBounds,
      referenceImageDataUrl,
      brandLogoUrl,
    }: {
      imageUrl: string;
      maskDataUrl?: string;
      prompt?: string;
      selectionBounds?: { x:number;y:number;width:number;height:number };
      referenceImageDataUrl?: string;
      brandLogoUrl?: string;
    } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    }

    const trim  = rawPrompt?.trim() ?? "";
    const lower = trim.toLowerCase();
    console.log(`[inpaint] prompt="${trim}" | bounds=${JSON.stringify(selectionBounds)}`);

    // ── Case 0.5: 加品牌 Logo（優先於 Case 0，避免有殘留參考圖時被攔截）────────
    if (detectLogoIntent(trim)) {
      console.log("[inpaint] LOGO mode → searching brand logo");
      const logoPath = await getBrandLogoPath(brandLogoUrl);
      if (logoPath) {
        const position = extractLogoPosition(trim);
        const resultUrl = await addLogoToImage(imageUrl, logoPath, position, selectionBounds);
        return NextResponse.json({ imageUrl: resultUrl });
      }
      console.warn("[inpaint] LOGO intent detected but no brand logo found — falling through to AI routing");
    }

    // ── Case 0: 有參考圖 → Gemini multimodal 編輯 ──────────────────────────
    if (referenceImageDataUrl) {
      console.log("[inpaint] REFERENCE IMAGE mode → Gemini multimodal");
      const resultUrl = await editWithReferenceImage({
        imageUrl,
        referenceImageDataUrl,
        prompt: trim || "apply the reference to this image",
        selectionBounds,
      });
      return NextResponse.json({ imageUrl: resultUrl });
    }

    // ── Case 0.7: 字體更改 → Gemini AI（鎖定文字內容只換字型）───────────────
    const fontChange = extractFontChange(trim);
    if (fontChange) {
      console.log(`[inpaint] FONT CHANGE mode → ${fontChange.fontName}`);
      const existingText = await extractTextFromImage(imageUrl);
      console.log(`[inpaint] existing text anchor: ${existingText?.slice(0, 80) ?? "(none)"}`);

      const fontPrompt =
        `You are given an advertisement image. Your ONLY task is to change the font style of the Chinese text.\n` +
        `TARGET FONT STYLE: ${fontChange.fontName} — ${fontChange.cssDescription}\n` +
        `EXACT TEXT TO PRESERVE (do NOT change a single character): ${existingText ?? "(read the text from the image)"}\n` +
        `STRICT RULES:\n` +
        `1. Text CONTENT must be 100% identical — every character, punctuation, number stays EXACTLY the same\n` +
        `2. ONLY change the visual font appearance: typeface and stroke style\n` +
        `3. Keep text position, size, and layout unchanged\n` +
        `4. Keep ALL non-text elements (product, background, colors) IDENTICAL\n` +
        `5. If unsure about any character, copy it EXACTLY as shown — do NOT guess or substitute\n` +
        `OUTPUT: Same image with ONLY the font style changed to ${fontChange.fontName}.`;

      const resultUrl = await generateImageOpenRouter(
        fontPrompt,
        `font-${Date.now()}`,
        undefined,   // styleReferenceImages
        false,       // useTextOverlay
        imageUrl,    // baseImageUrl
        undefined    // productImageUrls
      );
      return NextResponse.json({ imageUrl: resultUrl });
    }

    // ── Case 0.8: 文字內容替換 → Gemini AI（保留背景，只換文字內容）────────────
    const textReplacement = extractTextReplacement(trim);
    if (textReplacement) {
      console.log(`[inpaint] TEXT REPLACE mode → Gemini, newText="${textReplacement}"`);

      // 1. 用 Claude Vision 讀出圖上現有文字作為錨點
      const existingText = await extractTextFromImage(imageUrl);
      console.log(`[inpaint] existing text anchor: "${existingText?.slice(0, 80) ?? "(none)"}"`);

      // 2-3. 組合 Gemini prompt（逐字列出新文字，防止 Gemini 自行縮短或改寫）
      const replacePrompt =
        `You are given an advertisement image. Your task is to replace ONLY the specified text.\n\n` +
        `TASK: Replace the existing headline/main text with this EXACT new text:\n` +
        `"${textReplacement}"\n\n` +
        (existingText
          ? `FOR REFERENCE — current text visible in the image:\n${existingText}\n\n`
          : "") +
        (selectionBounds
          ? `LOCATION: Only modify text in the ${boundsToAreaHint(selectionBounds)} area of the image.\n\n`
          : `LOCATION: Replace the most prominent headline text.\n\n`) +
        `ABSOLUTE RULES — violations are unacceptable:\n` +
        `1. The new text must be EXACTLY: "${textReplacement}" — not paraphrased, not shortened, not modified in any way\n` +
        `2. Reproduce the new text character by character: ${textReplacement.split("").map((c, i) => `character ${i + 1} is "${c}"`).join(", ")}\n` +
        `3. Keep the EXACT same font style, weight, color, shadow, and visual treatment as the original headline\n` +
        `4. Keep the EXACT same text position — do NOT move anything\n` +
        `5. ALL other text in the image must remain 100% identical — do NOT touch any other text\n` +
        `6. The product, background, lighting, and all non-text elements must be PIXEL IDENTICAL\n` +
        `7. Do NOT add, remove, or alter any element except the specified text\n\n` +
        `OUTPUT: The same image with ONLY the headline text changed to "${textReplacement}". Everything else is unchanged.`;

      const resultUrl = await generateImageOpenRouter(
        replacePrompt,
        `replace-${Date.now()}`,
        undefined,
        false,
        imageUrl,   // baseImageUrl — Gemini 在原圖上修改
        undefined
      );
      return NextResponse.json({ imageUrl: resultUrl });
    }

    // ── Case 1: 加文字 → Sharp 直接燒入 ──────────────────────────────────────
    const textToAdd = extractTextToAdd(trim);
    if (textToAdd) {
      console.log(`[inpaint] ADD TEXT mode → "${textToAdd}"`);
      const resultUrl = await addTextToImage(imageUrl, textToAdd, selectionBounds);
      return NextResponse.json({ imageUrl: resultUrl });
    }

    // ── Case 2: 擦除 ─────────────────────────────────────────────────────────
    const isErase =
      !trim ||
      MARKETING_LABEL_REGEX.test(trim) ||
      ERASE_KEYWORDS.some((kw) => lower.includes(kw));

    if (isErase) {
      if (selectionBounds) {
        // 有選框 → 精確 AI 遮罩填充（只影響選取區域）
        console.log("[inpaint] ERASE with bounds → eraseRegionWithAI");
        const resultUrl = await eraseRegionWithAI(imageUrl, selectionBounds);
        return NextResponse.json({ imageUrl: resultUrl });
      } else {
        // 無選框 → Kontext 全圖擦除
        const erasePrompt =
          "seamlessly remove all text, watermarks, and written content from the image. " +
          "Fill with the surrounding background texture, color, and lighting. " +
          "Make it look natural and clean as if the text was never there.";
        console.log("[inpaint] ERASE without bounds → Kontext");
        const resultUrl = await editImageFal({ imageUrl, prompt: erasePrompt });
        return NextResponse.json({ imageUrl: resultUrl });
      }
    }

    // ── Case 3: 一般編輯 → Kontext ──────────────────────────────────────────
    const areaHint = boundsToAreaHint(selectionBounds);
    const finalPrompt = /[一-鿿]/.test(trim)
      ? (await translateToEnglish(trim) ?? trim)
      : trim;
    console.log(`[inpaint] EDIT mode | area=${areaHint} | prompt="${finalPrompt.slice(0, 80)}"`);

    const resultUrl = await editImageFal({ imageUrl, prompt: finalPrompt, areaHint });
    return NextResponse.json({ imageUrl: resultUrl });

  } catch (err) {
    console.error("[POST /api/inpaint]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
