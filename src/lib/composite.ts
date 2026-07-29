/**
 * composite.ts — 三層合成：背景 → 產品（去背）→ 文字
 *
 * 文字設計原則：
 * - 無白色或黑色色塊，文字直接浮在圖上
 * - 用 drop-shadow filter 確保任何背景下都清晰
 * - 顏色根據背景感自適應（深色字 + 白色陰影，或反之）
 */

import sharp from "sharp";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { removeBackground } from "@/lib/fal";

const UPLOADS = join(process.cwd(), "public/uploads");

type Placement = {
  productHeightRatio: number;
  xRatio: number;
  yRatio: number;
  textZone: "top-left" | "top-full" | "top-center" | "bottom-full" | "none";
};

const PLACEMENT: Record<string, Placement> = {
  A: { productHeightRatio: 0.40, xRatio: 0.72, yRatio: 0.65, textZone: "top-left"   },
  B: { productHeightRatio: 0.42, xRatio: 0.70, yRatio: 0.63, textZone: "top-full"   },
  C: { productHeightRatio: 0.38, xRatio: 0.75, yRatio: 0.67, textZone: "top-center" },
};

async function loadBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("/")) return readFile(join(process.cwd(), "public", url));
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapLines(text: string, maxChars: number, maxLines = 2): string[] {
  if (!text?.trim()) return [];
  const lines: string[] = [];
  let rest = text.trim();
  while (rest.length > 0 && lines.length < maxLines) {
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  return lines;
}

// ── 文字 SVG（無色塊，純文字 + drop-shadow）─────────────────────────────────

// 文字設計風格：
//   classic   = 黑漸層遮罩 + 白字（一般模式產品合成用）
//   brandGrad = 品牌主色漸層 + 白字（有品牌感、非實色 banner）
//   shadow    = 純白字 + 柔和陰影（無底板、唔遮產品）
//   outline   = 白字 + 深色描邊（無底板）
type TextStyle = "classic" | "brandGrad" | "shadow" | "outline";

function buildTextSvg(
  w: number, h: number,
  title: string, subtitle: string,
  zone: Placement["textZone"],
  style: TextStyle = "classic",
  brandColor = "#111111",
  gradColor?: string,   // brandGrad 用：已 blend 好嘅自適應漸層色（rgb 字串）；無就用 brandColor
): Buffer | null {
  if (zone === "none" || (!title?.trim() && !subtitle?.trim())) return null;

  const tSize  = Math.max(34, Math.floor(w / 15));
  const sSize  = Math.max(20, Math.floor(w / 24));
  const tLineH = tSize * 1.3;
  const sLineH = sSize * 1.45;
  const pad    = Math.floor(w * 0.065);

  // 中文字重 — 避免 Arial。macOS/libvips 可解析 PingFang TC / Noto Sans TC
  const FONT = "'Noto Sans TC','PingFang TC','Microsoft JhengHei','Heiti TC',sans-serif";

  let defs  = "";
  let rects = "";
  let texts = "";
  let gradId = 0;

  // 文字渲染 helper — 依 style 決定底板同字效。
  //   classic/brandGrad 用漸層遮罩（黑 / 品牌色）；shadow/outline 無底板、唔遮產品。
  const addBlock = (
    blockX: number, blockY: number, blockW: number, blockH: number,
    titleLines: string[], subLines: string[],
    textX: number, anchor: "start" | "middle"
  ) => {
    // ── 底板：只有 classic / brandGrad 用漸層（唔係實色 banner）──
    if (style === "classic" || style === "brandGrad") {
      const gid = `tg${gradId++}`;
      const featherH = blockH + pad * 1.2;
      // brandGrad：用自適應色（檢測底圖該區 + blend 品牌色）+ 低 opacity 半透明，融入相片
      const c  = style === "brandGrad" ? (gradColor ?? brandColor) : "#000000";
      const o1 = style === "brandGrad" ? "0.58" : "0.55";
      const o2 = style === "brandGrad" ? "0.32" : "0.38";
      defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${c}" stop-opacity="${o1}"/>
        <stop offset="60%"  stop-color="${c}" stop-opacity="${o2}"/>
        <stop offset="100%" stop-color="${c}" stop-opacity="0"/>
      </linearGradient>`;
      rects += `<rect x="0" y="${Math.max(0, blockY - pad * 0.3)}" width="${w}" height="${featherH}" fill="url(#${gid})"/>`;
    }

    // ── 文字：依 style 出唔同字效 ──
    const emit = (l: string, y: number, size: number, weight: string) => {
      if (style === "shadow") {
        // 多層遞增偏移黑字模擬柔和陰影（唔靠 filter，libr/resvg 相容）
        ([[5, 0.16], [3, 0.26], [2, 0.36]] as [number, number][]).forEach(([off, op]) => {
          texts += `<text x="${textX + off}" y="${y + off}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="black" opacity="${op}" text-anchor="${anchor}">${esc(l)}</text>`;
        });
        texts += `<text x="${textX}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="white" text-anchor="${anchor}">${esc(l)}</text>`;
      } else if (style === "outline") {
        texts += `<text x="${textX}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="none" stroke="rgba(0,0,0,0.6)" stroke-width="${Math.max(2.5, size * 0.07)}" stroke-linejoin="round" text-anchor="${anchor}">${esc(l)}</text>`;
        texts += `<text x="${textX}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="white" text-anchor="${anchor}">${esc(l)}</text>`;
      } else {
        // classic / brandGrad：偏移投影 + 白字
        texts += `<text x="${textX + 2}" y="${y + 2}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="black" opacity="0.35" text-anchor="${anchor}">${esc(l)}</text>`;
        texts += `<text x="${textX}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="white" text-anchor="${anchor}">${esc(l)}</text>`;
      }
    };

    let cy = blockY + pad * 0.7;
    titleLines.forEach(l => { emit(l, cy + tSize, tSize, "bold"); cy += tLineH; });
    cy += sSize * 0.15;
    subLines.forEach(l => { emit(l, cy + sSize, sSize, "normal"); cy += sLineH; });
  };

  if (zone === "top-left") {
    const maxW   = Math.floor(w * 0.88);
    const tChars = Math.floor(maxW / (tSize * 0.65));
    const sChars = Math.floor(maxW / (sSize * 0.65));
    const tLines = wrapLines(title, tChars, 2);
    const sLines = wrapLines(subtitle, sChars, 2);
    const bH = tLines.length * tLineH + sLines.length * sLineH + pad * 1.4;
    addBlock(pad * 0.3, pad * 0.3, maxW, bH, tLines, sLines, pad, "start");
  } else if (zone === "top-full") {
    const maxW   = Math.floor(w - pad * 0.6);
    const tChars = Math.floor((maxW - pad * 2) / (tSize * 0.65));
    const sChars = Math.floor((maxW - pad * 2) / (sSize * 0.65));
    const tLines = wrapLines(title, tChars, 2);
    const sLines = wrapLines(subtitle, sChars, 2);
    const bH = tLines.length * tLineH + sLines.length * sLineH + pad * 1.4;
    addBlock(pad * 0.3, pad * 0.3, maxW, bH, tLines, sLines, pad, "start");
  } else if (zone === "top-center") {
    const tChars = Math.floor((w - pad * 2) / (tSize * 0.65));
    const sChars = Math.floor((w - pad * 2) / (sSize * 0.65));
    const tLines = wrapLines(title, tChars, 2);
    const sLines = wrapLines(subtitle, sChars, 2);
    const bH = tLines.length * tLineH + sLines.length * sLineH + pad * 1.4;
    addBlock(pad * 0.3, pad * 0.3, w - pad * 0.6, bH, tLines, sLines, w / 2, "middle");
  } else {
    // bottom-full
    const tChars = Math.floor((w - pad * 2) / (tSize * 0.65));
    const sChars = Math.floor((w - pad * 2) / (sSize * 0.65));
    const tLines = wrapLines(title, tChars, 2);
    const sLines = wrapLines(subtitle, sChars, 2);
    const blockH = tLines.length * tLineH + sLines.length * sLineH + pad * 1.4;
    const blockY = h - blockH - pad * 0.3;
    addBlock(0, blockY, w, blockH, tLines, sLines, pad, "start");
  }

  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${rects}${texts}</svg>`
  );
}

// ── 陰影 ──────────────────────────────────────────────────────────────────────

function makeShadow(pw: number, ph: number): Buffer {
  return Buffer.from(
    `<svg width="${pw}" height="${ph}" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="s" cx="50%" cy="95%" r="45%">
        <stop offset="0%" stop-color="rgba(0,0,0,0.30)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
      </radialGradient></defs>
      <ellipse cx="${pw/2}" cy="${ph*0.96}" rx="${pw*0.30}" ry="${ph*0.04}" fill="url(#s)"/>
    </svg>`
  );
}

// ── 智慧 Logo 合成（像素級精準，不經 AI；自動選位 + 反白 + 光暈）────────────
// Gemini 會扭曲 logo，所以生圖完成後用 Sharp 把真實 logo 疊到最佳角落

type Corner   = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type TextZone = "top-left" | "top-full" | "top-center" | "bottom-full" | "none";
type BgTone   = "dark" | "light" | "medium";

// 採樣區域平均亮度
async function sampleRegionBrightness(
  src: sharp.Sharp,
  region: { left: number; top: number; width: number; height: number }
): Promise<number> {
  const { data } = await src
    .clone()
    .extract(region)
    .resize(16, 16, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += 3)
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (data.length / 3);
}

// 區域「忙碌程度」：回傳 0~1，越高代表細節越多（有產品/文字/邊緣），越低代表越乾淨平坦
// 用亮度標準差衡量：空白桌面/牆面變化小 → 低；產品或文字 → 變化大 → 高
async function sampleRegionBusyness(
  src: sharp.Sharp,
  region: { left: number; top: number; width: number; height: number }
): Promise<number> {
  const { data } = await src
    .clone()
    .extract(region)
    .resize(24, 24, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lumas: number[] = [];
  for (let i = 0; i < data.length; i += 3)
    lumas.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  const mean = lumas.reduce((a, b) => a + b, 0) / lumas.length;
  const variance = lumas.reduce((a, l) => a + (l - mean) ** 2, 0) / lumas.length;
  const std = Math.sqrt(variance);
  // std 0~~80 對應到 0~1（80 以上視為很忙）
  return Math.min(1, std / 80);
}

// 抽取區域平均 RGB（供自適應漸層用：檢測底圖該區實際顏色）
async function sampleRegionAvgColor(
  src: sharp.Sharp,
  region: { left: number; top: number; width: number; height: number }
): Promise<{ r: number; g: number; b: number }> {
  const { data } = await src
    .clone()
    .extract(region)
    .resize(16, 16, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0;
  const n = data.length / 3;
  for (let i = 0; i < data.length; i += 3) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

// hex → RGB（品牌色 blend 用）
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  if (h.length < 6) return { r: 17, g: 17, b: 17 };
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function classifyBrightness(luma: number): BgTone {
  if (luma < 80)  return "dark";
  if (luma > 175) return "light";
  return "medium";
}

function blockedCorners(textZone: TextZone): Corner[] {
  switch (textZone) {
    case "top-left":    return ["top-left"];
    case "top-full":    return ["top-left", "top-right"];
    case "top-center":  return ["top-left", "top-right"];
    case "bottom-full": return ["bottom-left", "bottom-right"];
    default:            return [];
  }
}

function cornerRegion(
  corner: Corner, cw: number, ch: number, lw: number, lh: number, pad: number
) {
  const w = Math.min(lw + pad * 2, cw);
  const h = Math.min(lh + pad * 2, ch);
  switch (corner) {
    case "top-left":     return { left: 0,      top: 0,      width: w, height: h };
    case "top-right":    return { left: cw - w, top: 0,      width: w, height: h };
    case "bottom-left":  return { left: 0,      top: ch - h, width: w, height: h };
    case "bottom-right": return { left: cw - w, top: ch - h, width: w, height: h };
  }
}

function logoPosition(
  corner: Corner, cw: number, ch: number, lw: number, lh: number, pad: number
) {
  switch (corner) {
    case "top-left":     return { left: pad,           top: pad };
    case "top-right":    return { left: cw - lw - pad, top: pad };
    case "bottom-left":  return { left: pad,           top: ch - lh - pad };
    case "bottom-right": return { left: cw - lw - pad, top: ch - lh - pad };
  }
}

// logo 深色像素反白（保留透明通道）
async function invertToWhite(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 30) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (luma < 140) data[i] = data[i + 1] = data[i + 2] = 255;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().toBuffer();
}

// 柔邊橢圓光暈 SVG
function makeGlowSvg(w: number, h: number, tone: BgTone): Buffer {
  const [r, g, b, alpha] =
    tone === "dark"  ? [255, 255, 255, 0.78] :
    tone === "light" ? [0,   0,   0,   0.10] :
                       [255, 255, 255, 0.55];
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stop-color="rgba(${r},${g},${b},${alpha})"/>
          <stop offset="55%"  stop-color="rgba(${r},${g},${b},${alpha * 0.65})"/>
          <stop offset="100%" stop-color="rgba(${r},${g},${b},0)"/>
        </radialGradient>
      </defs>
      <ellipse cx="${w/2}" cy="${h/2}" rx="${Math.floor(w*0.5)}" ry="${Math.floor(h*0.5)}" fill="url(#g)"/>
    </svg>`
  );
}

export async function overlayLogo(opts: {
  imageUrl:    string;
  logoUrl:     string;
  /** 舊版相容，textZone 未傳入時沿用此固定位置 */
  position?:   "bottom-right" | "bottom-left" | "top-right" | "top-left" | "bottom-center";
  widthRatio?: number;
  seed?:       string;
  /** 新增：傳入後啟用智慧選位（推薦） */
  textZone?:   TextZone;
}): Promise<string> {
  await mkdir(UPLOADS, { recursive: true });
  const { imageUrl, logoUrl, widthRatio = 0.12, seed, textZone, position } = opts;

  // 1. 底圖
  const baseBuf  = await loadBuffer(imageUrl);
  const baseMeta = await sharp(baseBuf).metadata();
  const cw = baseMeta.width  ?? 1024;
  const ch = baseMeta.height ?? 1024;

  // 2. Logo 縮放
  const logoBuf   = await loadBuffer(logoUrl);
  const targetW   = Math.max(48, Math.floor(cw * widthRatio));
  let logoResized = await sharp(logoBuf)
    .resize({ width: targetW, fit: "inside", withoutEnlargement: false })
    .png().toBuffer();
  let lMeta = await sharp(logoResized).metadata();
  const maxH = Math.floor(ch * 0.14);
  if ((lMeta.height ?? 0) > maxH) {
    logoResized = await sharp(logoBuf).resize({ height: maxH, fit: "inside" }).png().toBuffer();
    lMeta = await sharp(logoResized).metadata();
  }
  const lw  = lMeta.width  ?? targetW;
  const lh  = lMeta.height ?? Math.floor(targetW * 0.4);
  const pad = Math.floor(cw * 0.045);

  // 3. 決定擺放角落
  let chosenCorner: Corner;
  let chosenLuma:   number;
  if (textZone) {
    // 智慧選位：排除被文字占用的角落，對剩餘角落採樣亮度並評分
    const blocked   = blockedCorners(textZone);
    const ALL: Corner[] = ["top-right", "bottom-right", "bottom-left", "top-left"];
    const pool = ALL.filter((c) => !blocked.includes(c));
    const candidates = pool.length > 0 ? pool : (["bottom-right"] as Corner[]);
    const baseSharp = sharp(baseBuf).removeAlpha().toColorspace("srgb");
    const scores: { corner: Corner; luma: number; busy: number; score: number }[] = [];
    for (const corner of candidates) {
      const r = cornerRegion(corner, cw, ch, lw, lh, pad)!;
      const safeR = {
        left:   Math.max(0, Math.min(r.left,   cw - 1)),
        top:    Math.max(0, Math.min(r.top,    ch - 1)),
        width:  Math.max(1, Math.min(r.width,  cw - r.left)),
        height: Math.max(1, Math.min(r.height, ch - r.top)),
      };
      const luma = await sampleRegionBrightness(baseSharp, safeR);
      const busy = await sampleRegionBusyness(baseSharp, safeR);
      // 評分（權重）：
      //   乾淨度最重要（避開產品/文字）= 1 - busy，權重 1.0
      //   易讀性（中間亮度好疊 logo）= 1 - |luma-128|/128，權重 0.4
      //   右側位置略加分（品牌慣例）= 0.1
      const cleanScore = (1 - busy) * 1.0;
      const legibScore = (1 - Math.abs(luma - 128) / 128) * 0.4;
      const sideBonus  = corner.includes("right") ? 0.1 : 0;
      const score = cleanScore + legibScore + sideBonus;
      scores.push({ corner, luma, busy, score });
    }
    scores.sort((a, b) => b.score - a.score);
    chosenCorner = scores[0].corner;
    chosenLuma   = scores[0].luma;
    console.log(`[smartLogo] chosen=${chosenCorner} luma=${chosenLuma.toFixed(1)} busy=${scores[0].busy.toFixed(2)} tone=${classifyBrightness(chosenLuma)} blocked=[${blocked.join(",")}] | all=${scores.map(s => `${s.corner}(busy${s.busy.toFixed(2)},sc${s.score.toFixed(2)})`).join(" ")}`);
  } else {
    // 舊版相容：依 position 參數
    const posMap: Record<string, Corner> = {
      "top-left": "top-left", "top-right": "top-right",
      "bottom-left": "bottom-left", "bottom-right": "bottom-right",
      "bottom-center": "bottom-right",
    };
    chosenCorner = posMap[position ?? "bottom-right"] ?? "bottom-right";
    const r = cornerRegion(chosenCorner, cw, ch, lw, lh, pad)!;
    chosenLuma = await sampleRegionBrightness(
      sharp(baseBuf).removeAlpha().toColorspace("srgb"), r
    );
  }

  const bgTone = classifyBrightness(chosenLuma);

  // 4. Logo 反白（深色背景 + logo 本身也偏深時）
  let finalLogo = logoResized;
  if (bgTone === "dark") {
    const stats    = await sharp(logoResized).stats();
    const logoLuma = 0.2126 * stats.channels[0].mean
                   + 0.7152 * stats.channels[1].mean
                   + 0.0722 * stats.channels[2].mean;
    if (logoLuma < 155) {
      console.log(`[smartLogo] dark bg + dark logo (luma=${logoLuma.toFixed(1)}) → invert to white`);
      finalLogo = await invertToWhite(logoResized);
    }
  }

  // 5. 光暈底板
  const glowW   = Math.floor(lw * 2.4);
  const glowH   = Math.floor(lh * 2.4);
  const glowBuf = (bgTone === "dark" || bgTone === "medium")
    ? makeGlowSvg(glowW, glowH, bgTone) : null;

  // 6. 計算座標
  const { left: ll, top: lt } = logoPosition(chosenCorner, cw, ch, lw, lh, pad)!;
  const glowLeft = Math.max(0, ll - Math.floor((glowW - lw) / 2));
  const glowTop  = Math.max(0, lt - Math.floor((glowH - lh) / 2));

  // 7. 合成輸出
  const layers: sharp.OverlayOptions[] = [];
  if (glowBuf) layers.push({ input: glowBuf, left: glowLeft, top: glowTop, blend: "over" });
  layers.push({ input: finalLogo, left: ll, top: lt, blend: "over" });

  const filename = `ai-${seed ?? Date.now()}-logo.png`;
  await sharp(baseBuf).composite(layers).png().toFile(join(UPLOADS, filename));
  return `/uploads/${filename}`;
}

// ── 主要合成函式 ──────────────────────────────────────────────────────────────

export async function compositeImage(opts: {
  backgroundUrl: string;
  productImageUrl?: string;
  layoutType: string;
  canvasWidth: number;
  canvasHeight: number;
  titleText?: string;
  subtitleText?: string;
  seed?: string;
  /** 直接指定文字版面（底圖模式用；唔傳就跟 layoutType 的 PLACEMENT）。 */
  textZone?: Placement["textZone"];
  /** 文字設計風格（底圖模式用）。 */
  textStyle?: TextStyle;
  /** brandGrad 用嘅品牌主色（hex）。 */
  primaryColor?: string;
}): Promise<string> {
  await mkdir(UPLOADS, { recursive: true });

  const { backgroundUrl, productImageUrl, layoutType, canvasWidth, canvasHeight,
          titleText, subtitleText, seed, textZone, textStyle, primaryColor } = opts;
  const pl = PLACEMENT[layoutType] ?? PLACEMENT["A"];

  // 1. 背景
  const bgBuf = await loadBuffer(backgroundUrl);
  const bgResized = await sharp(bgBuf)
    .resize(canvasWidth, canvasHeight, { fit: "cover", position: "center" })
    .png().toBuffer();

  const layers: sharp.OverlayOptions[] = [];

  // 2. 產品（去背 + 合成）
  if (productImageUrl) {
    try {
      let prodBuf: Buffer | null = await removeBackground(productImageUrl);
      if (!prodBuf) {
        console.warn("[composite] bg removal failed → using original");
        prodBuf = await loadBuffer(productImageUrl);
      }
      const targetH = Math.floor(canvasHeight * pl.productHeightRatio);
      const resized = await sharp(prodBuf)
        .resize({ height: targetH, fit: "inside", withoutEnlargement: false })
        .png().toBuffer();

      const meta = await sharp(resized).metadata();
      const pw   = meta.width  ?? Math.floor(targetH * 0.6);
      const ph   = meta.height ?? targetH;
      const left = Math.max(0, Math.floor(canvasWidth  * pl.xRatio - pw / 2));
      const top  = Math.max(0, Math.floor(canvasHeight * pl.yRatio - ph / 2));

      layers.push({ input: makeShadow(pw, ph), left, top, blend: "over" });
      layers.push({ input: resized, left, top });
    } catch (e) {
      console.warn("[composite] product layer error:", e);
    }
  }

  // 3. 文字燒入（textZone 有傳就用佢，否則跟 layoutType 的 PLACEMENT）
  if (titleText?.trim() || subtitleText?.trim()) {
    const zone = textZone ?? pl.textZone;
    // brandGrad：檢測底圖文字區平均色 → 加深 + blend 品牌色 → 自適應半透明漸層（融入相片）
    let gradColor: string | undefined;
    if (textStyle === "brandGrad") {
      try {
        const isBottom = zone === "bottom-full";
        const region = {
          left: 0,
          top: isBottom ? Math.floor(canvasHeight * 0.72) : 0,
          width: canvasWidth,
          height: Math.max(1, Math.floor(canvasHeight * 0.28)),
        };
        const avg = await sampleRegionAvgColor(sharp(bgResized), region);
        const br = hexToRgb(primaryColor ?? "#111111");
        // 相片色加深（×0.45）+ 品牌色輕 tint（×0.25）→ 融入相片、保留品牌識別、夠暗令白字清晰
        const mix = (p: number, b: number) => Math.min(255, Math.round(p * 0.45 + b * 0.25));
        gradColor = `rgb(${mix(avg.r, br.r)},${mix(avg.g, br.g)},${mix(avg.b, br.b)})`;
      } catch { /* 失敗就用 fallback brandColor */ }
    }
    const textSvg = buildTextSvg(
      canvasWidth, canvasHeight,
      titleText ?? "", subtitleText ?? "",
      zone,
      textStyle ?? "classic",
      primaryColor ?? "#111111",
      gradColor,
    );
    if (textSvg) layers.push({ input: textSvg, top: 0, left: 0 });
  }

  // 4. 輸出
  const filename = `ai-${seed ?? Date.now()}.jpg`;
  await sharp(bgResized)
    .composite(layers)
    .jpeg({ quality: 93 })
    .toFile(join(UPLOADS, filename));

  return `/uploads/${filename}`;
}
