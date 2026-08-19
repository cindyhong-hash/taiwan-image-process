/**
 * composite.ts — 三層合成：背景 → 產品（去背）→ 文字
 *
 * 文字設計原則：
 * - 無白色或黑色色塊，文字直接浮在圖上
 * - 用 drop-shadow filter 確保任何背景下都清晰
 * - 顏色根據背景感自適應（深色字 + 白色陰影，或反之）
 */

import "@/lib/fonts"; // 必須喺 sharp 之前 import，令 fontconfig 揾到打包咗嘅中文字型
import sharp from "sharp";
import { removeBackground } from "@/lib/fal";
import { loadBuffer, saveBuffer } from "@/lib/storage";

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

/**
 * 多圖拼版：把多張子圖依歸一化矩形排進一張畫布（白底、細縫隔開）。
 * 子圖以 cover 方式填滿各自格子（裁切多餘），輸出單張拼版大圖。
 */
export async function compositeCollage(opts: {
  cellUrls: string[];
  rects: { x: number; y: number; w: number; h: number }[];
  canvasWidth: number;
  canvasHeight: number;
  gap?: number;        // 格與格間距（px）
  seed?: string;
  plusOverlayText?: string;  // five-plus：在最後一格疊「+X」黑底遮罩
  accentColor?: string;      // 給了就用「主色調出的淡底」當拼版底色（延伸主題），否則白底
}): Promise<string> {
  const { cellUrls, rects, canvasWidth: W, canvasHeight: H } = opts;
  const gap = opts.gap ?? Math.round(Math.min(W, H) * 0.012);
  const half = Math.floor(gap / 2);
  const lastIdx = Math.min(cellUrls.length, rects.length) - 1;

  const layers: sharp.OverlayOptions[] = [];
  for (let i = 0; i < cellUrls.length && i < rects.length; i++) {
    const r = rects[i];
    // 像素矩形（內縮 gap 的一半，做出格縫）
    let left = Math.round(r.x * W) + (r.x > 0 ? half : 0);
    let top = Math.round(r.y * H) + (r.y > 0 ? half : 0);
    let w = Math.round(r.w * W) - (r.x > 0 ? half : 0) - (r.x + r.w < 1 ? half : 0);
    let h = Math.round(r.h * H) - (r.y > 0 ? half : 0) - (r.y + r.h < 1 ? half : 0);
    w = Math.max(1, w); h = Math.max(1, h);
    left = Math.max(0, Math.min(left, W - 1));
    top = Math.max(0, Math.min(top, H - 1));

    try {
      const buf = await loadBuffer(cellUrls[i]);
      const fitted = await sharp(buf)
        .resize(w, h, { fit: "cover", position: "centre" })
        .toBuffer();
      layers.push({ input: fitted, left, top });

      // five-plus：最後一格疊半透明黑底 + 白色「+X」
      if (opts.plusOverlayText && i === lastIdx) {
        const fs = Math.floor(Math.min(w, h) * 0.42);
        const overlay = Buffer.from(
          `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${w}" height="${h}" fill="rgba(0,0,0,0.6)"/>
            <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
              font-family="'PingFang TC','Noto Sans TC',Arial,sans-serif" font-size="${fs}" font-weight="bold" fill="#ffffff">${esc(opts.plusOverlayText)}</text>
          </svg>`
        );
        layers.push({ input: overlay, left, top });
      }
    } catch (e) {
      console.warn(`[collage] cell ${i} failed to load: ${cellUrls[i]}`, e);
    }
  }

  const collageBg = opts.accentColor ? shadeColor(opts.accentColor, 0.85) : "#ffffff";
  const out = await sharp({
    create: { width: W, height: H, channels: 4, background: collageBg },
  })
    .composite(layers)
    .jpeg({ quality: 95 })
    .toBuffer();

  const url = await saveBuffer(out, "jpg", "collage-");
  console.log(`[collage] ✅ ${cellUrls.length} cells → ${url}`);
  return url;
}

// ── 副圖文字卡片（Sharp 程式合成，7 種版型；同組一致、跨組可輪換）─────────────
// 前 4 種：文字疊在照片上（scrim/半透明容器）
// 後 3 種：白底卡片容器，文字永遠在白底區塊、不疊在照片上
export type SubCardVariant =
  | "badge-top-left" | "banner-bottom" | "side-accent" | "minimal-top"
  | "photo-caption-pill" | "card-price-bottom" | "card-badge-straddle"
  | "title-top-caption-bottom" | "gradient-bottom" | "split-left-text"
  | "ribbon-top-card" | "corner-label-card"
  | "ribbon-tab-card" | "diagonal-ribbon-card" | "minimal-top-label-card"
  | "speech-bubble-price" | "photo-full-top-text";

const CARD_FONT = "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";

/** 副標的「圓角長按鈕」底：淡品牌色圓角膠囊 + 文字（content-hug）。text 需已 esc。回傳 SVG 片段。 */
function subtitleButtonSvg(
  text: string,
  o: { align: "center" | "left"; anchorX: number; centerY: number; fs: number; accent: string },
): string {
  if (!text) return "";
  const { align, anchorX, centerY, fs, accent } = o;
  const padX = Math.round(fs * 0.95);
  const pillH = Math.round(fs * 2.0);
  const textW = Math.round(text.length * fs * 1.02);
  const pillW = textW + padX * 2;
  const pillX = align === "center" ? Math.round(anchorX - pillW / 2) : Math.round(anchorX);
  const pillY = Math.round(centerY - pillH / 2);
  const textX = align === "center" ? anchorX : anchorX + padX;
  const anchor = align === "center" ? "middle" : "start";
  const textY = Math.round(pillY + pillH * 0.68);
  return `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="${accent}" fill-opacity="0.14"/>`
    + `<text x="${textX}" y="${textY}" text-anchor="${anchor}" font-family="${CARD_FONT}" font-size="${fs}" font-weight="500" fill="#444444">${text}</text>`;
}

/** 依容器寬度反推適合字級並自動換行（最多 maxLines 行，超出截斷加…）。中文以字元寬≈字級估算。 */
function fitAndWrap(
  text: string,
  boxWidth: number,
  maxSize: number,
  maxLines = 2,
  minSize?: number,
): { size: number; lines: string[] } {
  const t = (text || "").trim();
  const lo = minSize ?? Math.max(12, Math.round(maxSize * 0.55));
  if (!t) return { size: maxSize, lines: [] };
  let size = maxSize;
  const coeff = 1.06; // 中文字寬估算係數（>1 較保守，寧可縮小也不讓字超出容器）
  while (size > lo) {
    const perLine = Math.max(1, Math.floor(boxWidth / (size * coeff)));
    if (Math.ceil(t.length / perLine) <= maxLines) break;
    size -= 1;
  }
  const perLine = Math.max(1, Math.floor(boxWidth / (size * coeff)));
  const lines: string[] = [];
  let rest = t;
  while (rest.length > 0 && lines.length < maxLines) {
    if (lines.length === maxLines - 1 && rest.length > perLine) {
      lines.push(rest.slice(0, Math.max(1, perLine - 1)) + "…");
      rest = "";
    } else {
      lines.push(rest.slice(0, perLine));
      rest = rest.slice(perLine);
    }
  }
  return { size, lines: lines.map(esc) };
}

/** 圓角矩形 path（topOnly=只圓上緣，用於「照片頂到卡片頂邊」的版型） */
function roundRectPath(w: number, h: number, r: number, topOnly = false): string {
  if (topOnly) {
    return `M0,${h} L0,${r} Q0,0 ${r},0 L${w - r},0 Q${w},0 ${w},${r} L${w},${h} Z`;
  }
  return `M${r},0 L${w - r},0 Q${w},0 ${w},${r} L${w},${h - r} Q${w},${h} ${w - r},${h} L${r},${h} Q0,${h} 0,${h - r} L0,${r} Q0,0 ${r},0 Z`;
}

/** 產生圓角照片 PNG（cover 裁切到 w×h，套圓角遮罩） */
async function roundedPhoto(buf: Buffer, w: number, h: number, r: number, topOnly = false): Promise<Buffer> {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const resized = await sharp(buf).resize(w, h, { fit: "cover" }).toBuffer();
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><path d="${roundRectPath(w, h, r, topOnly)}" fill="#fff"/></svg>`,
  );
  return sharp(resized).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

/** 取圖片主色（Sharp stats.dominant）；太亮則壓暗，確保白字/劃線可讀。失敗回退。 */
export async function extractDominantColor(imageUrl: string, fallback = "#4A90D9"): Promise<string> {
  try {
    const buf = await loadBuffer(imageUrl);
    const { dominant } = await sharp(buf).stats();
    let { r, g, b } = dominant;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum > 0.72) { r = Math.round(r * 0.6); g = Math.round(g * 0.6); b = Math.round(b * 0.6); } // 太亮壓暗
    const hex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return fallback;
  }
}

export async function overlaySubImageCard(opts: {
  imageUrl: string;
  badgeText: string;
  headline: string;
  subtitle?: string;
  priceText?: string;
  originalPriceText?: string;
  /** AI 產的短分類標（2-4字）。標籤型版型會拿它當小標籤，主標題(headline)則移到卡片下方。 */
  tagText?: string;
  accentColor: string;
  variant: SubCardVariant;
  /** 目標尺寸＝拼版格子的實際像素寬高。給了就以此比例排版，避免拼版 cover 裁切把文字切掉。 */
  targetWidth?: number;
  targetHeight?: number;
  seed?: string;
}): Promise<string> {
  let imgBuf: Buffer = await loadBuffer(opts.imageUrl);
  let W: number, H: number;
  if (opts.targetWidth && opts.targetHeight) {
    // 依格子實際比例排版：先把底圖 cover 到格子尺寸，之後文字/照片都以此比例佈局，拼版時不再裁掉文字
    W = Math.max(1, Math.round(opts.targetWidth));
    H = Math.max(1, Math.round(opts.targetHeight));
    imgBuf = await sharp(imgBuf).resize(W, H, { fit: "cover", position: "centre" }).toBuffer();
  } else {
    const meta = await sharp(imgBuf).metadata();
    W = meta.width ?? 800;
    H = meta.height ?? 800;
  }
  const accent = opts.accentColor || "#4A90D9";
  const badgeRaw = (opts.badgeText || "").trim().slice(0, 8);
  const badge = esc(badgeRaw);
  const priceText = esc((opts.priceText || "").trim());
  const originalPriceText = esc((opts.originalPriceText || "").trim());
  const pad = Math.round(W * 0.045);

  const whiteCardVariants = ["photo-caption-pill", "card-price-bottom", "card-badge-straddle", "title-top-caption-bottom", "split-left-text", "ribbon-top-card", "corner-label-card", "ribbon-tab-card", "diagonal-ribbon-card", "minimal-top-label-card", "speech-bubble-price", "photo-full-top-text"];
  const isWhiteCard = whiteCardVariants.includes(opts.variant);

  // ═══════ 組合式卡片（照片＋文字面板，文字不直接壓在照片上）═══════
  if (isWhiteCard) {
    const out = await buildWhiteCard(imgBuf, {
      W, H, accent, badge,
      headline: opts.headline || "",
      subtitle: (opts.subtitle || "").trim(),
      tagText: (opts.tagText || "").trim(),
      priceText, originalPriceText,
      variant: opts.variant as "photo-caption-pill" | "card-price-bottom" | "card-badge-straddle" | "title-top-caption-bottom" | "split-left-text" | "ribbon-top-card" | "corner-label-card" | "ribbon-tab-card" | "diagonal-ribbon-card" | "minimal-top-label-card" | "speech-bubble-price" | "photo-full-top-text",
    });
    return saveBuffer(out, "jpg", "subcard-");
  }

  // ═══════ 文字疊照片（原 4 種，補上動態縮字/防溢出）═══════
  const sub = esc((opts.subtitle || "").trim());
  let svgInner = "";

  if (opts.variant === "badge-top-left" || opts.variant === "side-accent") {
    const isSide = opts.variant === "side-accent";
    const blockX = isSide ? Math.round(W * 0.04) + 14 : pad;
    const blockY = pad;
    const blockW = Math.round(W * (isSide ? 0.56 : 0.62));
    const innerPad = Math.round(W * 0.03);
    const boxW = blockW - innerPad * 2;
    const fsBadge = Math.round(W * 0.036);
    const { size: fsHead, lines: headLines } = fitAndWrap(opts.headline || "", boxW, Math.round(W * 0.062), 2);
    const fsSub = Math.round(W * 0.038);
    const badgeH = Math.round(fsBadge * 1.9);
    const lineH = Math.round(fsHead * 1.18);
    const subH = sub ? Math.round(fsSub * 1.5) : 0;
    const blockH = innerPad * 2 + (badge ? badgeH + Math.round(W * 0.02) : 0) + headLines.length * lineH + subH;
    const badgePart = badge
      ? `<rect x="${blockX + innerPad}" y="${blockY + innerPad - fsBadge}" width="${badgeRaw.length * fsBadge + fsBadge * 1.4}" height="${badgeH}" rx="${badgeH / 2}" fill="${accent}"/>
         <text x="${blockX + innerPad + fsBadge * 0.7}" y="${blockY + innerPad + fsBadge * 0.35}" font-family="${CARD_FONT}" font-size="${fsBadge}" font-weight="700" fill="#ffffff">${badge}</text>`
      : "";
    const yStart = blockY + innerPad + (badge ? badgeH + Math.round(W * 0.02) : 0) + fsHead;
    const headParts = headLines.map((l, i) =>
      `<text x="${blockX + innerPad}" y="${yStart + i * lineH}" font-family="${CARD_FONT}" font-size="${fsHead}" font-weight="800" fill="#1a1a1a">${l}</text>`).join("");
    const subPart = sub
      ? `<text x="${blockX + innerPad}" y="${yStart + headLines.length * lineH + fsSub}" font-family="${CARD_FONT}" font-size="${fsSub}" font-weight="400" fill="#666666">${sub}</text>`
      : "";
    svgInner =
      `${isSide ? `<rect x="0" y="0" width="6" height="${H}" fill="${accent}"/>` : ""}
       <rect x="${blockX}" y="${blockY}" width="${blockW}" height="${blockH}" rx="${Math.round(W * 0.02)}" fill="#ffffff" fill-opacity="${isSide ? 0.9 : 0.85}"/>
       ${badgePart}${headParts}${subPart}`;
  } else if (opts.variant === "banner-bottom") {
    const bH = Math.round(H * 0.3);
    const bY = H - bH;
    const cx = W / 2;
    const fsBadge = Math.round(W * 0.036);
    const { size: fsHead, lines: headLines } = fitAndWrap(opts.headline || "", W * 0.9, Math.round(W * 0.062), 2);
    const fsSub = Math.round(W * 0.038);
    const badgePart = badge
      ? `<text x="${cx}" y="${bY + bH * 0.28}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsBadge}" font-weight="400" fill="${accent}">${badge}</text>`
      : "";
    const headParts = headLines.map((l, i) =>
      `<text x="${cx}" y="${bY + bH * 0.52 + i * fsHead * 1.15}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsHead}" font-weight="800" fill="#1a1a1a">${l}</text>`).join("");
    const subPart = sub
      ? `<text x="${cx}" y="${bY + bH * 0.85}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsSub}" font-weight="400" fill="#666666">${sub}</text>`
      : "";
    svgInner =
      `<rect x="0" y="${bY}" width="${W}" height="${bH}" fill="#ffffff" fill-opacity="0.88"/>
       <rect x="0" y="${bY}" width="${W}" height="2" fill="${accent}"/>
       ${badgePart}${headParts}${subPart}`;
  } else if (opts.variant === "gradient-bottom") {
    // 整張照片 + 底部漸層 scrim（透明→黑）+ 壓白字
    const bH = Math.round(H * 0.5), bY = H - bH;
    const { size: fsHead, lines: headLines } = fitAndWrap(opts.headline || "", W - pad * 2, Math.round(W * 0.062), 2);
    const fsSub = Math.round(W * 0.036);
    const bottomPad = Math.round(H * 0.055);
    const subBaseline = H - bottomPad;
    const headBottom = subBaseline - (sub ? Math.round(fsSub * 1.7) : 0);
    const headParts = headLines.map((l, i) => {
      const y = headBottom - (headLines.length - 1 - i) * fsHead * 1.18;
      return `<text x="${pad}" y="${y}" font-family="${CARD_FONT}" font-size="${fsHead}" font-weight="800" fill="#ffffff">${l}</text>`;
    }).join("");
    const headTop = headBottom - (headLines.length - 1) * fsHead * 1.18;
    const gbFsBadge = Math.round(W * 0.034), gbBadgeH = Math.round(gbFsBadge * 1.9);
    const gbBadgeW = badge ? Math.round(badgeRaw.length * gbFsBadge + gbFsBadge * 1.4) : 0;
    const gbBadgeY = headTop - fsHead - Math.round(H * 0.022) - gbBadgeH;
    const badgePart = badge
      ? `<rect x="${pad}" y="${gbBadgeY}" width="${gbBadgeW}" height="${gbBadgeH}" rx="${Math.round(gbBadgeH / 2)}" fill="${accent}"/>`
        + `<text x="${pad + gbBadgeW / 2}" y="${gbBadgeY + gbBadgeH * 0.68}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${gbFsBadge}" font-weight="700" fill="#ffffff">${badge}</text>`
      : "";
    const subPart = sub
      ? `<text x="${pad}" y="${subBaseline}" font-family="${CARD_FONT}" font-size="${fsSub}" font-weight="400" fill="#ffffff" fill-opacity="0.9">${sub}</text>`
      : "";
    svgInner =
      `<defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.72"/></linearGradient></defs>`
      + `<rect x="0" y="${bY}" width="${W}" height="${bH}" fill="url(#gb)"/>${badgePart}${headParts}${subPart}`;
  } else {
    // minimal-top
    const tH = Math.round(H * 0.28);
    const { size: fsHead, lines: headLines } = fitAndWrap(opts.headline || "", W - pad * 2, Math.round(W * 0.062), 2);
    const fsSub = Math.round(W * 0.038);
    const headParts = headLines.map((l, i) =>
      `<text x="${pad}" y="${tH * 0.42 + i * fsHead * 1.15}" font-family="${CARD_FONT}" font-size="${fsHead}" font-weight="800" fill="#1a1a1a">${l}</text>`).join("");
    const badgePart = badge
      ? `<text x="${pad}" y="${tH * 0.2}" font-family="${CARD_FONT}" font-size="${fsSub}" font-weight="400" letter-spacing="2" fill="#888888">${badge.toUpperCase()}</text>`
      : "";
    svgInner =
      `<rect x="0" y="0" width="${W}" height="${tH}" fill="${accent}" fill-opacity="0.15"/>
       ${badgePart}${headParts}`;
  }

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svgInner}</svg>`;
  const out = await sharp(imgBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  return saveBuffer(out, "jpg", "subcard-");
}

/** 白底卡片容器合成：① 白卡背景 → ② 圓角照片 → ③ 文字 → ④ 標籤（最上層，避免被照片蓋住） */
async function buildWhiteCard(
  imgBuf: Buffer,
  o: {
    W: number; H: number; accent: string; badge: string;
    headline: string; subtitle: string; priceText: string; originalPriceText: string; tagText?: string;
    variant: "photo-caption-pill" | "card-price-bottom" | "card-badge-straddle" | "title-top-caption-bottom" | "split-left-text" | "ribbon-top-card" | "corner-label-card" | "ribbon-tab-card" | "diagonal-ribbon-card" | "minimal-top-label-card" | "speech-bubble-price" | "photo-full-top-text";
  },
): Promise<Buffer> {
  const { W, H, accent, badge, headline, subtitle, priceText, originalPriceText, variant } = o;
  // 標籤型版型：有 AI 短標(tag)時 → 標籤放短標、主標題移到卡片下方；沒短標 → 標籤退回用主標題、下方放副標
  const tagText = (o.tagText || "").trim();
  const labelText = tagText || headline;
  const bottomText = tagText ? headline : subtitle;
  const R = Math.round(W * 0.035);
  const fsBadge = Math.round(W * 0.032);
  const badgeH = Math.round(fsBadge * 2.0);
  const badgeW = badge ? Math.round(badge.length * fsBadge + fsBadge * 1.6) : 0;
  // 註：corner-label / diagonal-ribbon 會疊在照片角落，「忙碌就退回安全版型」改到 produceSet 做「整組」決定（維持同組一致）。

  const layers: sharp.OverlayOptions[] = [];
  let cardBgSvg = "";
  let textSvg = "";
  let badgeSvg = "";
  let photoBuf: Buffer | null = null;
  let photoX = 0, photoY = 0;

  const shadow = `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="${Math.round(W * 0.006)}" stdDeviation="${Math.round(W * 0.012)}" flood-color="#000000" flood-opacity="0.18"/></filter>`;

  if (variant === "photo-caption-pill") {
    const m = Math.round(W * 0.04);
    const gap = Math.round(H * 0.02);
    const pillX = m, pillW = W - m * 2;
    const innerW = pillW - Math.round(W * 0.08);
    // 先算文字 → 反推膠囊高度（依內容，不留多餘白）
    const { size: fsHead, lines } = fitAndWrap(headline, innerW, Math.round(W * 0.05), subtitle ? 1 : 2);
    const fsSub = Math.round(W * 0.032);
    const subLine = subtitle ? (fitAndWrap(subtitle, innerW, fsSub, 1).lines[0] ?? "") : "";
    const padV = Math.round(H * 0.028);
    const headBlockH = lines.length * fsHead * 1.18;
    const subBlockH = subLine ? Math.round(fsSub * 2.3) : 0;  // 副標圓角按鈕比純文字高
    const pillH = Math.round(padV * 2 + headBlockH + subBlockH);
    const photoW = pillW;
    const photoH = Math.max(Math.round(H * 0.35), H - m * 2 - gap - pillH);
    photoX = m; photoY = m;
    photoBuf = await roundedPhoto(imgBuf, photoW, photoH, R);
    const pillY = m + photoH + gap;
    const cx = pillX + pillW / 2;
    const headBase = pillY + padV + fsHead * 0.85;
    const headParts = lines.map((l, i) =>
      `<text x="${cx}" y="${headBase + i * fsHead * 1.18}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsHead}" font-weight="800" fill="#1a1a1a">${l}</text>`).join("");
    const subPart = subLine
      ? subtitleButtonSvg(subLine, { align: "center", anchorX: cx, centerY: pillY + padV + headBlockH + fsSub * 0.7, fs: fsSub, accent })
      : "";
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${Math.round(Math.min(pillH / 2, R * 1.6))}" fill="#ffffff" filter="url(#sh)"/></svg>`;
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${headParts}${subPart}</svg>`;
  } else if (variant === "card-price-bottom") {
    const m = Math.round(W * 0.035);
    const cardX = m, cardY = m, cardW = W - m * 2, cardH = H - m * 2;
    const photoPad = Math.round(W * 0.035);
    const innerX = cardX + photoPad;
    const innerW = cardW - photoPad * 2;
    // 文字帶高度依內容計算，照片吃掉剩餘高度（消除下方留白）
    const { size: fsHead, lines } = fitAndWrap(headline, innerW, Math.round(W * 0.048), 2);
    const fsPrice = Math.round(W * 0.07);
    const fsOrig = Math.round(W * 0.036);
    const fsSub2 = Math.round(W * 0.033);
    const hasPrice = !!(priceText || originalPriceText);
    // 沒有價格時，底部白帶改放副標，避免整條白底空空的很怪
    const subLine = (!hasPrice && subtitle) ? (fitAndWrap(subtitle, innerW, fsSub2, 1).lines[0] ?? "") : "";
    const hasSecondary = hasPrice || !!subLine;
    const gapAfterPhoto = Math.round(H * 0.028);
    const headBlockH = lines.length * fsHead * 1.18;
    const gapHeadPrice = hasSecondary ? Math.round(H * 0.012) : 0;
    const secondaryBlockH = hasPrice ? Math.round(fsPrice * 1.05) : (subLine ? Math.round(fsSub2 * 2.2) : 0);
    const botPad = Math.round(H * 0.032);
    const textBandH = gapAfterPhoto + headBlockH + gapHeadPrice + secondaryBlockH + botPad;
    photoX = innerX; photoY = cardY + photoPad;
    const photoW = innerW;
    const photoH = Math.max(Math.round(cardH * 0.35), cardH - photoPad - textBandH);
    photoBuf = await roundedPhoto(imgBuf, photoW, photoH, Math.round(R * 0.7));
    const textTop = photoY + photoH + gapAfterPhoto;
    const headParts = lines.map((l, i) =>
      `<text x="${innerX}" y="${textTop + fsHead * 0.9 + i * fsHead * 1.18}" font-family="${CARD_FONT}" font-size="${fsHead}" font-weight="800" fill="#1a1a1a">${l}</text>`).join("");
    const priceBase = textTop + headBlockH + gapHeadPrice + fsPrice * 0.85;
    const pricePart = priceText
      ? `<text x="${innerX}" y="${priceBase}" font-family="${CARD_FONT}" font-size="${fsPrice}" font-weight="800" fill="${accent}">${priceText}</text>`
      : "";
    const origX = innerX + (priceText ? priceText.length * fsPrice * 0.62 + Math.round(W * 0.03) : 0);
    const origPart = originalPriceText
      ? `<text x="${origX}" y="${priceBase - fsPrice * 0.12}" font-family="${CARD_FONT}" font-size="${fsOrig}" font-weight="400" fill="#999999">${originalPriceText}</text>`
        + `<line x1="${origX}" y1="${priceBase - fsPrice * 0.27}" x2="${origX + originalPriceText.length * fsOrig * 0.62}" y2="${priceBase - fsPrice * 0.27}" stroke="#999999" stroke-width="${Math.max(1, Math.round(W * 0.003))}"/>`
      : "";
    const subPart = subLine
      ? subtitleButtonSvg(subLine, { align: "left", anchorX: innerX, centerY: textTop + headBlockH + gapHeadPrice + fsSub2 * 0.7, fs: fsSub2, accent })
      : "";
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}" fill="#ffffff" filter="url(#sh)"/></svg>`;
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${headParts}${pricePart}${origPart}${subPart}</svg>`;
    if (badge) {
      const bx = photoX + Math.round(W * 0.03), by = photoY + Math.round(W * 0.03);
      badgeSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
        + `<rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="${Math.round(badgeH / 2)}" fill="${accent}"/>`
        + `<text x="${bx + badgeW / 2}" y="${by + badgeH * 0.68}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsBadge}" font-weight="700" fill="#ffffff">${badge}</text></svg>`;
    }
  } else if (variant === "card-badge-straddle") {
    // card-badge-straddle：照片頂到卡片頂/左/右邊，標籤跨界疊在照片與白底交界
    const m = Math.round(W * 0.035);
    const cardX = m, cardY = m, cardW = W - m * 2, cardH = H - m * 2;
    const innerX = cardX + Math.round(W * 0.045);
    const innerW = cardW - Math.round(W * 0.09);
    const { size: fsHead, lines } = fitAndWrap(headline, innerW, Math.round(W * 0.046), 2);
    const fsPrice = Math.round(W * 0.055);
    const fsOrig = Math.round(W * 0.034);
    const fsSub2 = Math.round(W * 0.032);
    const hasPrice = !!(priceText || originalPriceText);
    // 沒有價格時，底部白帶改放副標，避免空白很怪
    const subLine = (!hasPrice && subtitle) ? (fitAndWrap(subtitle, innerW, fsSub2, 1).lines[0] ?? "") : "";
    const hasSecondary = hasPrice || !!subLine;
    // 文字帶高度依內容計算（含標籤跨界的下半部），照片吃掉剩餘高度
    const overhang = badge ? Math.round(badgeH * 0.55) : Math.round(H * 0.02);
    const gapAfter = Math.round(H * 0.018);
    const headBlockH = lines.length * fsHead * 1.18;
    const gapHeadPrice = hasSecondary ? Math.round(H * 0.01) : 0;
    const priceBlockH = hasPrice ? Math.round(fsPrice * 1.05) : (subLine ? Math.round(fsSub2 * 2.2) : 0);
    const botPad = Math.round(H * 0.032);
    const textBandH = overhang + gapAfter + headBlockH + gapHeadPrice + priceBlockH + botPad;
    photoX = cardX; photoY = cardY;
    const photoW = cardW;
    const photoH = Math.max(Math.round(cardH * 0.35), cardH - textBandH);
    photoBuf = await roundedPhoto(imgBuf, photoW, photoH, R, true); // 只圓上緣
    const boundaryY = photoY + photoH;
    const textTop = boundaryY + overhang + gapAfter;
    const headParts = lines.map((l, i) =>
      `<text x="${innerX}" y="${textTop + fsHead * 0.9 + i * fsHead * 1.18}" font-family="${CARD_FONT}" font-size="${fsHead}" font-weight="800" fill="#1a1a1a">${l}</text>`).join("");
    const priceBase = textTop + headBlockH + gapHeadPrice + fsPrice * 0.85;
    const origPart = originalPriceText
      ? `<text x="${innerX}" y="${priceBase - fsPrice * 0.12}" font-family="${CARD_FONT}" font-size="${fsOrig}" font-weight="400" fill="#999999">${originalPriceText}</text>`
        + `<line x1="${innerX}" y1="${priceBase - fsPrice * 0.27}" x2="${innerX + originalPriceText.length * fsOrig * 0.62}" y2="${priceBase - fsPrice * 0.27}" stroke="#999999" stroke-width="${Math.max(1, Math.round(W * 0.003))}"/>`
      : "";
    const priceX2 = innerX + (originalPriceText ? originalPriceText.length * fsOrig * 0.62 + Math.round(W * 0.03) : 0);
    const pricePart = priceText
      ? `<text x="${priceX2}" y="${priceBase}" font-family="${CARD_FONT}" font-size="${fsPrice}" font-weight="800" fill="${accent}">${priceText}</text>`
      : "";
    const subPart = subLine
      ? subtitleButtonSvg(subLine, { align: "left", anchorX: innerX, centerY: textTop + headBlockH + gapHeadPrice + fsSub2 * 0.7, fs: fsSub2, accent })
      : "";
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}" fill="#ffffff" filter="url(#sh)"/></svg>`;
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${headParts}${origPart}${pricePart}${subPart}</svg>`;
    if (badge) {
      const bx = innerX;
      const by = Math.round(boundaryY - badgeH / 2); // 跨界：一半蓋照片、一半蓋白底
      badgeSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
        + `<rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="${Math.round(badgeH / 2)}" fill="${accent}"/>`
        + `<text x="${bx + badgeW / 2}" y="${by + badgeH * 0.68}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsBadge}" font-weight="700" fill="#ffffff">${badge}</text></svg>`;
    }
  } else if (variant === "title-top-caption-bottom") {
    // 標題在上、照片在中、說明在下（course-card 風格）
    const m = Math.round(W * 0.035);
    const cardX = m, cardY = m, cardW = W - m * 2, cardH = H - m * 2;
    const innerX = cardX + Math.round(W * 0.04);
    const innerW = cardW - Math.round(W * 0.08);
    const cx = cardX + cardW / 2;
    const { size: fsHead, lines } = fitAndWrap(headline, innerW, Math.round(W * 0.05), 2);
    const fsSub = Math.round(W * 0.032);
    const subLine = subtitle ? (fitAndWrap(subtitle, innerW, fsSub, 1).lines[0] ?? "") : "";
    const topPad = Math.round(H * 0.04);
    const titleBlockH = lines.length * fsHead * 1.18;
    const accentBarH = Math.max(2, Math.round(H * 0.007));
    const titleAreaH = topPad + titleBlockH + Math.round(H * 0.016) + accentBarH + Math.round(H * 0.028);
    const botCaptionH = subLine ? Math.round(fsSub * 2.4) : Math.round(H * 0.035);
    const photoX = innerX, photoY = cardY + titleAreaH, photoW = innerW;
    const photoH = Math.max(Math.round(cardH * 0.35), cardH - titleAreaH - botCaptionH);
    photoBuf = await roundedPhoto(imgBuf, photoW, photoH, Math.round(R * 0.7));
    const titleParts = lines.map((l, i) =>
      `<text x="${cx}" y="${cardY + topPad + fsHead * 0.9 + i * fsHead * 1.18}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsHead}" font-weight="800" fill="#1a1a1a">${l}</text>`).join("");
    const barW = Math.round(W * 0.1), barY = cardY + topPad + titleBlockH + Math.round(H * 0.012);
    const accentBar = `<rect x="${cx - barW / 2}" y="${barY}" width="${barW}" height="${accentBarH}" rx="${accentBarH / 2}" fill="${accent}"/>`;
    const subPart = subLine
      ? subtitleButtonSvg(subLine, { align: "center", anchorX: cx, centerY: photoY + photoH + botCaptionH / 2, fs: fsSub, accent })
      : "";
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}" fill="#ffffff" filter="url(#sh)"/></svg>`;
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${titleParts}${accentBar}${subPart}</svg>`;
    if (badge) {
      const bx = photoX + Math.round(W * 0.03), by = photoY + Math.round(W * 0.03);
      badgeSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
        + `<rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="${Math.round(badgeH / 2)}" fill="${accent}"/>`
        + `<text x="${bx + badgeW / 2}" y="${by + badgeH * 0.68}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsBadge}" font-weight="700" fill="#ffffff">${badge}</text></svg>`;
    }
  } else if (variant === "ribbon-top-card") {
    // 頂部色帶 header（標題白字）→ 中間商品圖 → 底部白底副標（電商 2 層卡風格）
    const m = Math.round(W * 0.035);
    const cardX = m, cardY = m, cardW = W - m * 2, cardH = H - m * 2;
    const innerX = cardX + Math.round(W * 0.045);
    const innerW = cardW - Math.round(W * 0.09);
    const cx = cardX + cardW / 2;
    const { size: fsHead, lines } = fitAndWrap(labelText, innerW, Math.round(W * 0.05), 2);
    const fsSub = Math.round(W * 0.032);
    const subLine = bottomText ? (fitAndWrap(bottomText, innerW, fsSub, 1).lines[0] ?? "") : "";
    const hTopPad = Math.round(H * 0.035);
    const headBlockH = lines.length * fsHead * 1.2;
    const headerH = Math.round(hTopPad * 2 + headBlockH);
    const captionH = subLine ? Math.round(fsSub * 2.6) : Math.round(H * 0.03);
    const photoPad = Math.round(W * 0.03);
    photoX = cardX + photoPad; photoY = cardY + headerH + Math.round(H * 0.02);
    const photoW = cardW - photoPad * 2;
    const photoH = Math.max(Math.round(cardH * 0.3), (cardY + cardH - captionH) - photoY);
    photoBuf = await roundedPhoto(imgBuf, photoW, photoH, Math.round(R * 0.7));
    // 白卡底 + 頂部色帶（上緣圓角、下緣切齊）
    const headerBand = `<g transform="translate(${cardX},${cardY})"><path d="${roundRectPath(cardW, headerH, R, true)}" fill="${accent}"/></g>`;
    const headParts = lines.map((l, i) =>
      `<text x="${cx}" y="${cardY + hTopPad + fsHead * 0.92 + i * fsHead * 1.2}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsHead}" font-weight="800" fill="#ffffff">${l}</text>`).join("");
    const subPart = subLine
      ? subtitleButtonSvg(subLine, { align: "center", anchorX: cx, centerY: photoY + photoH + captionH / 2, fs: fsSub, accent })
      : "";
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}" fill="#ffffff" filter="url(#sh)"/>${headerBand}</svg>`;
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${headParts}${subPart}</svg>`;
  } else if (variant === "corner-label-card") {
    // 左上角「圓弧缺角」色塊放標題 + 底部放主標題（CATISS 風格）
    const m = Math.round(W * 0.035);
    const cardX = m, cardY = m, cardW = W - m * 2, cardH = H - m * 2;
    const fsSub = Math.round(W * 0.04);
    const subLine = bottomText ? (fitAndWrap(bottomText, cardW - Math.round(W * 0.1), fsSub, 1).lines[0] ?? "") : "";
    const captionH = subLine ? Math.round(fsSub * 2.3) : Math.round(H * 0.03);
    photoX = cardX; photoY = cardY;
    const photoW = cardW;
    const photoH = cardH - captionH;
    photoBuf = await roundedPhoto(imgBuf, photoW, photoH, R, true); // 上緣圓角
    // 左上角圓弧缺角色塊（半透明白，深字）— 疊在照片上（最上層）；標籤直式堆疊 + 大圓弧缺角
    const hRaw = (labelText || "").trim();
    const labTopPad = Math.round(H * 0.042);
    const labPadX = Math.round(W * 0.04);
    let fsLab: number, labLines: string[];
    if (hRaw.length >= 2 && hRaw.length <= 6) {
      // 短標籤：平均切成 2 行直式堆疊（如 補水／舒緩）
      const half = Math.ceil(hRaw.length / 2);
      labLines = [esc(hRaw.slice(0, half)), esc(hRaw.slice(half))].filter(Boolean);
      fsLab = Math.round(W * 0.064);
    } else {
      const r = fitAndWrap(hRaw, Math.round(cardW * 0.4) - labPadX * 2, Math.round(W * 0.05), 3);
      fsLab = r.size; labLines = r.lines;
    }
    const maxLineChars = Math.max(1, ...labLines.map((l) => l.length));
    const blockW = Math.min(Math.round(cardW * 0.62), maxLineChars * fsLab + labPadX * 2);
    const blockH = Math.round(labTopPad * 2 + labLines.length * fsLab * 1.24);
    const rBR = Math.round(Math.min(blockW, blockH) * 0.85);
    const cornerPath = `M${R},0 L${blockW},0 L${blockW},${blockH - rBR} Q${blockW},${blockH} ${blockW - rBR},${blockH} L0,${blockH} L0,${R} Q0,0 ${R},0 Z`;
    const labInnerX = cardX + labPadX;
    const labParts = labLines.map((l, i) =>
      `<text x="${labInnerX}" y="${cardY + labTopPad + fsLab * 0.9 + i * fsLab * 1.24}" font-family="${CARD_FONT}" font-size="${fsLab}" font-weight="800" fill="#1a1a1a">${l}</text>`).join("");
    const subPart = subLine
      ? `<text x="${cardX + cardW / 2}" y="${photoY + photoH + captionH * 0.66}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsSub}" font-weight="700" fill="#1a1a1a">${subLine}</text>`
      : "";
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}" fill="#ffffff" filter="url(#sh)"/></svg>`;
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${subPart}</svg>`;
    // 角落色塊 + 標籤字放 badgeSvg（最後貼，蓋在照片上）
    badgeSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
      + `<g transform="translate(${cardX},${cardY})"><path d="${cornerPath}" fill="#ffffff" fill-opacity="0.82"/></g>${labParts}</svg>`;
  } else if (variant === "ribbon-tab-card") {
    // 頁籤式：左上角一個「資料夾頁籤」小標（標題白字）→ 照片 → 底部副標按鈕
    const m = Math.round(W * 0.035);
    const cardX = m, cardY = m, cardW = W - m * 2, cardH = H - m * 2;
    const tabPadX = Math.round(W * 0.038), tabPadY = Math.round(H * 0.02);
    const { size: fsTab, lines: tabLines } = fitAndWrap(labelText, Math.round(cardW * 0.62) - tabPadX * 2, Math.round(W * 0.044), 2);
    const tabTextW = Math.max(1, ...tabLines.map((l) => l.length)) * fsTab;
    const tabW = Math.min(Math.round(cardW * 0.72), Math.round(tabTextW + tabPadX * 2));
    const tabH = Math.round(tabPadY * 2 + tabLines.length * fsTab * 1.2);
    const fsSub = Math.round(W * 0.032);
    const subLine = bottomText ? (fitAndWrap(bottomText, cardW - Math.round(W * 0.1), fsSub, 1).lines[0] ?? "") : "";
    const captionH = subLine ? Math.round(fsSub * 2.3) : Math.round(H * 0.03);
    photoX = cardX + Math.round(W * 0.03); photoY = cardY + tabH + Math.round(H * 0.015);
    const photoW = cardW - Math.round(W * 0.06);
    const photoH = Math.max(Math.round(cardH * 0.3), (cardY + cardH - captionH) - photoY);
    photoBuf = await roundedPhoto(imgBuf, photoW, photoH, Math.round(R * 0.7));
    const tabParts = tabLines.map((l, i) =>
      `<text x="${cardX + tabPadX}" y="${cardY + tabPadY + fsTab * 0.92 + i * fsTab * 1.2}" font-family="${CARD_FONT}" font-size="${fsTab}" font-weight="800" fill="#ffffff">${l}</text>`).join("");
    const subPart = subLine
      ? subtitleButtonSvg(subLine, { align: "center", anchorX: cardX + cardW / 2, centerY: photoY + photoH + captionH / 2, fs: fsSub, accent })
      : "";
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}" fill="#ffffff" filter="url(#sh)"/>`
      + `<rect x="${cardX}" y="${cardY}" width="${tabW}" height="${tabH}" rx="${R}" fill="${accent}"/></svg>`;
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${tabParts}${subPart}</svg>`;
  } else if (variant === "diagonal-ribbon-card") {
    // 照片內縮進白卡；立體緞帶貼在白卡「右上角」（不壓照片主體）；底部白底放描述
    const m = Math.round(W * 0.035);
    const cardX = m, cardY = m, cardW = W - m * 2, cardH = H - m * 2;
    const photoPad = Math.round(W * 0.04);
    const innerX = cardX + photoPad, innerW = cardW - photoPad * 2;
    const fsSub = Math.round(W * 0.036);
    const subLine = bottomText ? (fitAndWrap(bottomText, innerW, fsSub, 1).lines[0] ?? "") : "";
    const capGap = Math.round(H * 0.024);
    const captionH = Math.round(capGap + (subLine ? Math.round(fsSub * 1.5) : 0) + photoPad);
    photoX = innerX; photoY = cardY + photoPad;
    const photoW = innerW;
    const photoH = Math.max(Math.round(cardH * 0.3), (cardY + cardH - captionH) - photoY);
    photoBuf = await roundedPhoto(imgBuf, photoW, photoH, Math.round(R * 0.7));
    const subPart = subLine
      ? `<text x="${cardX + cardW / 2}" y="${photoY + photoH + capGap + fsSub * 0.9}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsSub}" font-weight="500" fill="#555555">${subLine}</text>`
      : "";
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}" fill="#ffffff" filter="url(#sh)"/></svg>`;
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${subPart}</svg>`;
    // 立體緞帶（右上角）：accent 底 + 上亮下暗 sheen + 投影 + 兩端裁切在卡片內（tuck 感）
    const fsRib = Math.round(W * 0.028);
    const bandH = Math.round(fsRib * 2.0);
    const D = Math.round(cardW * 0.4);
    const p1x = cardX + cardW - D, p1y = cardY, p2x = cardX + cardW, p2y = cardY + D;
    const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2;
    const bandLen = Math.round(Math.hypot(D, D) + W * 0.05);
    const ribLabel = fitAndWrap(labelText, bandLen - Math.round(W * 0.05), fsRib, 1).lines[0] ?? "";
    const clipId = `dclip-${Math.round(cardX)}-${Math.round(cardY)}`;
    const gid = `dsheen-${Math.round(cardX)}-${Math.round(cardY)}`;
    const fid = `dsh-${Math.round(cardX)}-${Math.round(cardY)}`;
    badgeSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>`
      + `<clipPath id="${clipId}"><rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}"/></clipPath>`
      + `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.3"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.22"/></linearGradient>`
      + `<filter id="${fid}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="${Math.max(1, Math.round(W * 0.004))}" stdDeviation="${Math.round(W * 0.008)}" flood-color="#000000" flood-opacity="0.35"/></filter></defs>`
      + `<g clip-path="url(#${clipId})"><g transform="rotate(45 ${mx} ${my})" filter="url(#${fid})">`
      + `<rect x="${mx - bandLen / 2}" y="${my - bandH / 2}" width="${bandLen}" height="${bandH}" fill="${accent}"/>`
      + `<rect x="${mx - bandLen / 2}" y="${my - bandH / 2}" width="${bandLen}" height="${bandH}" fill="url(#${gid})"/>`
      + `<text x="${mx}" y="${my + fsRib * 0.36}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsRib}" font-weight="700" fill="#ffffff">${ribLabel}</text>`
      + `</g></g></svg>`;
  } else if (variant === "minimal-top-label-card") {
    // 極簡頂標：頂部小分類字（品牌色、字距）+ 細線 → 照片 → 底部主標題
    const m = Math.round(W * 0.035);
    const cardX = m, cardY = m, cardW = W - m * 2, cardH = H - m * 2;
    const cx = cardX + cardW / 2;
    const fsLabel = Math.round(W * 0.032);
    // 收窄可用寬度（扣掉 letter-spacing 的額外寬度）＋硬截斷，避免頂標溢出
    const labelLine = fitAndWrap(labelText, cardW - Math.round(W * 0.22), fsLabel, 1).lines[0] ?? "";
    const topPad = Math.round(H * 0.045);
    const ruleY = cardY + topPad + Math.round(fsLabel * 1.1);
    const headerH = topPad + Math.round(fsLabel * 1.1) + Math.round(H * 0.028);
    const fsSub = Math.round(W * 0.04);
    const subLine = bottomText ? (fitAndWrap(bottomText, cardW - Math.round(W * 0.1), fsSub, 1).lines[0] ?? "") : "";
    const captionH = subLine ? Math.round(fsSub * 2.3) : Math.round(H * 0.03);
    photoX = cardX + Math.round(W * 0.03); photoY = cardY + headerH;
    const photoW = cardW - Math.round(W * 0.06);
    const photoH = Math.max(Math.round(cardH * 0.3), (cardY + cardH - captionH) - photoY);
    photoBuf = await roundedPhoto(imgBuf, photoW, photoH, Math.round(R * 0.7));
    const ruleW = Math.round(W * 0.06);
    const subPart = subLine
      ? `<text x="${cx}" y="${photoY + photoH + captionH * 0.66}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsSub}" font-weight="700" fill="#1a1a1a">${subLine}</text>`
      : "";
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}" fill="#ffffff" filter="url(#sh)"/></svg>`;
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
      + `<text x="${cx}" y="${cardY + topPad + fsLabel * 0.9}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsLabel}" font-weight="600" letter-spacing="1" fill="${accent}">${labelLine}</text>`
      + `<rect x="${cx - ruleW / 2}" y="${ruleY}" width="${ruleW}" height="${Math.max(2, Math.round(H * 0.004))}" rx="1" fill="${accent}"/>`
      + `${subPart}</svg>`;
  } else if (variant === "speech-bubble-price") {
    // 對話框標題 + 置中產品圖（無白卡外框）+ 底部說明/價格；整格淡色底（依 accent）
    const tint = shadeColor(accent, 0.86);        // 淡色背景
    const deep = shadeColor(accent, -0.55);       // 對話框標題深色字
    const pad = Math.round(W * 0.06);
    // 頂部對話框（含左下角小三角尾巴）
    const bubbleX = pad, bubbleY = Math.round(H * 0.05), bubbleW = W - pad * 2;
    const bubblePadX = Math.round(W * 0.045), bubblePadY = Math.round(H * 0.028);
    const { size: fsTitle, lines: titleLines } = fitAndWrap(headline, bubbleW - bubblePadX * 2, Math.round(W * 0.055), 2);
    const titleBlockH = titleLines.length * fsTitle * 1.2;
    const bubbleH = Math.round(bubblePadY * 2 + titleBlockH);
    const bubbleR = Math.round(Math.min(bubbleW, bubbleH) * 0.24);
    const tailW = Math.round(W * 0.055), tailH = Math.round(H * 0.028);
    const tailX = bubbleX + Math.round(bubbleW * 0.18);
    // 底部：說明列（灰）+ 價格列（防呆：沒價格就不畫）
    const fsDesc = Math.round(W * 0.038);
    const descLine = subtitle ? (fitAndWrap(subtitle, W - pad * 2, fsDesc, 1).lines[0] ?? "") : "";
    const hasPrice = !!(priceText || originalPriceText);
    const fsPrice = Math.round(W * 0.062), fsOrig = Math.round(fsPrice * 0.52);
    const bottomBandH = Math.round(H * 0.03)
      + (descLine ? Math.round(fsDesc * 1.4) : 0)
      + (hasPrice ? Math.round(fsPrice * 1.4) : 0)
      + Math.round(H * 0.03);
    // 中間置中產品圖（無圓角、無白卡框，直接落在淡色底）
    const photoTop = bubbleY + bubbleH + tailH + Math.round(H * 0.025);
    const photoW = Math.round(W * 0.8);
    const photoH = Math.max(Math.round(H * 0.24), (H - bottomBandH) - photoTop);
    photoX = Math.round((W - photoW) / 2); photoY = photoTop;
    photoBuf = await roundedPhoto(imgBuf, photoW, photoH, 0);
    const cx = W / 2;
    // 對話框形狀（白底 + 陰影 + 尾巴）疊在淡色底上
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="0" y="0" width="${W}" height="${H}" fill="${tint}"/>`
      + `<g filter="url(#sh)">`
      + `<rect x="${bubbleX}" y="${bubbleY}" width="${bubbleW}" height="${bubbleH}" rx="${bubbleR}" fill="#ffffff"/>`
      + `<path d="M${tailX},${bubbleY + bubbleH - 1} L${tailX},${bubbleY + bubbleH + tailH} L${tailX + tailW},${bubbleY + bubbleH - 1} Z" fill="#ffffff"/>`
      + `</g></svg>`;
    // 對話框標題（深色粗體、置中）
    const titleTop = bubbleY + bubblePadY + fsTitle * 0.92;
    const titleParts = titleLines.map((l, i) =>
      `<text x="${cx}" y="${titleTop + i * fsTitle * 1.2}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsTitle}" font-weight="800" fill="${deep}">${l}</text>`).join("");
    // 底部說明 + 價格
    const descY = photoY + photoH + Math.round(H * 0.03) + fsDesc * 0.8;
    const descPart = descLine
      ? `<text x="${cx}" y="${descY}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsDesc}" font-weight="400" fill="#888888">${descLine}</text>`
      : "";
    let pricePart = "";
    if (hasPrice) {
      const priceY = descY + (descLine ? Math.round(fsDesc * 0.8) : 0) + fsPrice * 0.9;
      const saleStr = priceText ? `限定價 ${priceText}` : "";
      const origStr = originalPriceText ? `原價 ${originalPriceText}` : "";
      const saleW = saleStr.length * fsPrice * 0.62;
      const origW = origStr.length * fsOrig * 0.62;
      const gap = origStr && saleStr ? Math.round(W * 0.035) : 0;
      const totalW = saleW + (origStr ? gap + origW : 0);
      const startX = cx - totalW / 2;
      const salePart = saleStr
        ? `<text x="${startX}" y="${priceY}" font-family="${CARD_FONT}" font-size="${fsPrice}" font-weight="800" fill="${accent}">${saleStr}</text>`
        : "";
      const origX = startX + saleW + gap;
      const origPart = origStr
        ? `<text x="${origX}" y="${priceY - fsPrice * 0.1}" font-family="${CARD_FONT}" font-size="${fsOrig}" font-weight="400" fill="#999999">${origStr}</text>`
          + `<line x1="${origX}" y1="${priceY - fsPrice * 0.22}" x2="${origX + origW}" y2="${priceY - fsPrice * 0.22}" stroke="#999999" stroke-width="${Math.max(1, Math.round(W * 0.003))}"/>`
        : "";
      pricePart = salePart + origPart;
    }
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${titleParts}${descPart}${pricePart}</svg>`;
  } else if (variant === "photo-full-top-text") {
    // 滿版圓角照片 + 上方柔和淺色漸層（確保深字清晰）+ 頂部放 短標/主標/副標（生圖時已預留上方乾淨區）
    const m = Math.round(W * 0.035);
    const cardX = m, cardY = m, cardW = W - m * 2, cardH = H - m * 2;
    photoX = cardX; photoY = cardY;
    photoBuf = await roundedPhoto(imgBuf, cardW, cardH, R);
    const pad = Math.round(W * 0.055);
    const innerX = cardX + pad, innerW = cardW - pad * 2;
    const fsTag = Math.round(W * 0.03);
    const tagLine = tagText ? (fitAndWrap(tagText, innerW, fsTag, 1).lines[0] ?? "") : "";
    const { size: fsTitle, lines: titleLines } = fitAndWrap(headline, innerW, Math.round(W * 0.058), 2);
    const fsSub = Math.round(W * 0.034);
    const subLine = subtitle && subtitle !== headline ? (fitAndWrap(subtitle, innerW, fsSub, 1).lines[0] ?? "") : "";
    // 由上往下堆疊
    let yCur = cardY + pad;
    const tagPart = tagLine
      ? `<text x="${innerX}" y="${yCur + fsTag * 0.9}" font-family="${CARD_FONT}" font-size="${fsTag}" font-weight="700" letter-spacing="2" fill="${accent}">${tagLine}</text>`
      : "";
    if (tagLine) yCur += Math.round(fsTag * 1.7);
    const titleTop = yCur + fsTitle * 0.9;
    const titleParts = titleLines.map((l, i) =>
      `<text x="${innerX}" y="${titleTop + i * fsTitle * 1.18}" font-family="${CARD_FONT}" font-size="${fsTitle}" font-weight="800" fill="#1a1a1a">${l}</text>`).join("");
    yCur = titleTop + (titleLines.length - 1) * fsTitle * 1.18;
    const subPart = subLine
      ? `<text x="${innerX}" y="${yCur + Math.round(H * 0.012) + fsSub * 0.9}" font-family="${CARD_FONT}" font-size="${fsSub}" font-weight="500" fill="#3a3a3a">${subLine}</text>`
      : "";
    const gradH = Math.round(cardH * 0.5);
    const clipId = `pfc-${Math.round(cardX)}-${Math.round(cardY)}`;
    const gid = `pfg-${Math.round(cardX)}-${Math.round(cardY)}`;
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}" fill="#ffffff" filter="url(#sh)"/></svg>`;
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>`
      + `<clipPath id="${clipId}"><rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}"/></clipPath>`
      + `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="0.55" stop-color="#ffffff" stop-opacity="0.62"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>`
      + `<g clip-path="url(#${clipId})"><rect x="${cardX}" y="${cardY}" width="${cardW}" height="${gradH}" fill="url(#${gid})"/></g>`
      + `${tagPart}${titleParts}${subPart}</svg>`;
  } else {
    // split-left-text：左側文字面板、右側照片、交界處漸層過渡
    const m = Math.round(W * 0.03);
    const cardX = m, cardY = m, cardW = W - m * 2, cardH = H - m * 2;
    const panelW = Math.round(cardW * 0.46);
    photoX = cardX + panelW; photoY = cardY;
    const photoW = cardW - panelW;
    photoBuf = await roundedPhoto(imgBuf, photoW, cardH, R);
    const innerX = cardX + Math.round(W * 0.05);
    const innerW = panelW - Math.round(W * 0.07);
    const { size: fsHead, lines } = fitAndWrap(headline, innerW, Math.round(W * 0.05), 3);
    const fsSub = Math.round(W * 0.03);
    const subLines = subtitle ? fitAndWrap(subtitle, innerW, fsSub, 2).lines : [];
    const headBlockH = lines.length * fsHead * 1.2;
    const subBlockH = subLines.length ? subLines.length * fsSub * 1.35 + Math.round(H * 0.02) : 0;
    const badgeGap = badge ? Math.round(H * 0.055) : 0;
    const totalH = badgeGap + headBlockH + subBlockH;
    const startY = cardY + Math.max(Math.round(H * 0.06), (cardH - totalH) / 2) + badgeGap + fsHead * 0.8;
    const headParts = lines.map((l, i) =>
      `<text x="${innerX}" y="${startY + i * fsHead * 1.2}" font-family="${CARD_FONT}" font-size="${fsHead}" font-weight="800" fill="#1a1a1a">${l}</text>`).join("");
    const subStart = startY + lines.length * fsHead * 1.2 + Math.round(H * 0.02);
    const subParts = subLines.map((l, i) =>
      `<text x="${innerX}" y="${subStart + i * fsSub * 1.35}" font-family="${CARD_FONT}" font-size="${fsSub}" font-weight="400" fill="#666666">${l}</text>`).join("");
    const badgePart = badge
      ? `<rect x="${innerX}" y="${startY - fsHead - badgeH}" width="${badgeW}" height="${badgeH}" rx="${Math.round(badgeH / 2)}" fill="${accent}"/>`
        + `<text x="${innerX + badgeW / 2}" y="${startY - fsHead - badgeH + badgeH * 0.68}" text-anchor="middle" font-family="${CARD_FONT}" font-size="${fsBadge}" font-weight="700" fill="#ffffff">${badge}</text>`
      : "";
    const seamW = Math.round(W * 0.09), seamX = cardX + panelW;
    cardBgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${shadow}</defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${R}" fill="#ffffff" filter="url(#sh)"/></svg>`;
    // 面板淡色 + 交界漸層（在照片之上，讓右照片左緣柔和過渡到左面板）
    textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>`
      + `<linearGradient id="sp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>`
      + `<rect x="${cardX}" y="${cardY}" width="${panelW}" height="${cardH}" fill="${accent}" fill-opacity="0.07"/>`
      + `<rect x="${seamX}" y="${cardY}" width="${seamW}" height="${cardH}" fill="url(#sp)"/>`
      + `${badgePart}${headParts}${subParts}</svg>`;
  }

  // 圖層堆疊：白卡背景 → 圓角照片 → 文字 → 標籤（標籤獨立、最後貼，避免被照片蓋住）
  layers.push({ input: Buffer.from(cardBgSvg), top: 0, left: 0 });
  if (photoBuf) layers.push({ input: photoBuf, top: Math.round(photoY), left: Math.round(photoX) });
  if (textSvg) layers.push({ input: Buffer.from(textSvg), top: 0, left: 0 });
  if (badgeSvg) layers.push({ input: Buffer.from(badgeSvg), top: 0, left: 0 });

  // 卡片外緣底色：依主色調出的淡色（延伸主題），與拼版底色一致，取代原本固定灰
  const base = sharp({
    create: { width: W, height: H, channels: 4, background: shadeColor(accent, 0.85) },
  });
  return base.composite(layers).jpeg({ quality: 95 }).toBuffer();
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 把 hex 顏色調亮或調深。factor ∈ [-1,1]：負值往黑靠（調深，如 -0.55 當標題色），正值往白靠（調亮，如 0.86 當淡底色）。 */
export function shadeColor(hex: string, factor: number): string {
  const h = (hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return hex;
  const num = parseInt(full, 16);
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  if (factor < 0) {
    const f = 1 + factor;                 // -0.55 → 0.45 倍
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
  } else {
    r = Math.round(r + (255 - r) * factor);
    g = Math.round(g + (255 - g) * factor);
    b = Math.round(b + (255 - b) * factor);
  }
  const to2 = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
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

/**
 * 把「去背後的真實產品圖」合成到已生成的場景上（保證產品像素級精準）。
 * region 為歸一化矩形（0-1）：產品縮到框內、置中、底部加柔和橢圓陰影。
 */
export async function overlayProduct(opts: {
  sceneUrl: string;
  productBuf: Buffer;          // 已去背的產品 PNG（透明底）
  region: { x: number; y: number; w: number; h: number };
  align?: "center" | "bottom"; // 垂直對齊（產品排成一列時用 bottom 貼齊檯面）
  seed?: string;
}): Promise<string> {
  const sceneBuf = await loadBuffer(opts.sceneUrl);
  const meta = await sharp(sceneBuf).metadata();
  const W = meta.width ?? 800;
  const H = meta.height ?? 800;

  const boxW = Math.max(1, Math.round(W * opts.region.w));
  const boxH = Math.max(1, Math.round(H * opts.region.h));
  const pMeta = await sharp(opts.productBuf).metadata();
  const pw = pMeta.width ?? boxW;
  const ph = pMeta.height ?? boxH;
  const scale = Math.min(boxW / pw, boxH / ph);
  const rw = Math.max(1, Math.round(pw * scale));
  const rh = Math.max(1, Math.round(ph * scale));
  const resized = await sharp(opts.productBuf).resize(rw, rh, { fit: "inside" }).png().toBuffer();

  const left = Math.round(W * opts.region.x + (boxW - rw) / 2);
  const top = opts.align === "bottom"
    ? Math.round(H * opts.region.y + (boxH - rh))       // 底部貼齊檯面
    : Math.round(H * opts.region.y + (boxH - rh) / 2);  // 垂直置中

  // 柔和接地陰影（模糊橢圓）
  const shId = "prodsh";
  const cx = left + rw / 2;
  const cy = top + rh * 0.99;
  const shadowSvg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="${shId}"><feGaussianBlur stdDeviation="${Math.max(2, Math.round(W * 0.012))}"/></filter></defs>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${Math.round(rw * 0.42)}" ry="${Math.max(3, Math.round(rh * 0.05))}" fill="#000000" fill-opacity="0.28" filter="url(#${shId})"/></svg>`,
  );

  const out = await sharp(sceneBuf)
    .composite([
      { input: shadowSvg, top: 0, left: 0 },
      { input: resized, top, left },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
  return saveBuffer(out, "jpg", "prod-");
}

// ── 文字 SVG（無色塊，純文字 + drop-shadow）─────────────────────────────────

function buildTextSvg(
  w: number, h: number,
  title: string, subtitle: string,
  zone: Placement["textZone"]
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

  // 文字渲染 helper — 用漸層遮罩取代生硬黑色色塊，模擬真實攝影暗角
  const addBlock = (
    blockX: number, blockY: number, blockW: number, blockH: number,
    titleLines: string[], subLines: string[],
    textX: number, anchor: "start" | "middle"
  ) => {
    // 漸層遮罩：上方半透明黑 → 下方透明（feather 邊緣，非硬色塊）
    const gid = `tg${gradId++}`;
    const featherH = blockH + pad * 1.2;
    defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="rgba(0,0,0,0.55)"/>
      <stop offset="65%"  stop-color="rgba(0,0,0,0.38)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>`;
    rects += `<rect x="0" y="${Math.max(0, blockY - pad * 0.3)}" width="${w}" height="${featherH}" fill="url(#${gid})"/>`;

    let cy = blockY + pad * 0.7;
    titleLines.forEach(l => {
      // 柔和投影（偏移描邊）→ 模擬光源陰影
      texts += `<text x="${textX + 2}" y="${cy + tSize + 2}"
        font-family="${FONT}"
        font-size="${tSize}" font-weight="bold"
        fill="black" text-anchor="${anchor}" opacity="0.35">${esc(l)}</text>`;
      texts += `<text x="${textX}" y="${cy + tSize}"
        font-family="${FONT}"
        font-size="${tSize}" font-weight="bold"
        fill="white" text-anchor="${anchor}">${esc(l)}</text>`;
      cy += tLineH;
    });
    cy += sSize * 0.15;
    subLines.forEach(l => {
      texts += `<text x="${textX + 1}" y="${cy + sSize + 1}"
        font-family="${FONT}"
        font-size="${sSize}"
        fill="black" text-anchor="${anchor}" opacity="0.30">${esc(l)}</text>`;
      texts += `<text x="${textX}" y="${cy + sSize}"
        font-family="${FONT}"
        font-size="${sSize}"
        fill="rgba(255,255,255,0.95)" text-anchor="${anchor}">${esc(l)}</text>`;
      cy += sLineH;
    });
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

/** 取一張圖「左上或右上角」的忙碌度（0~1）。produceSet 用來判斷角標/緞帶會不會壓到主體。 */
export async function sampleCornerBusyness(imageUrl: string, side: "left" | "right"): Promise<number> {
  try {
    const buf = await loadBuffer(imageUrl);
    const meta = await sharp(buf).metadata();
    const W = meta.width ?? 800, H = meta.height ?? 800;
    const left = side === "right" ? Math.round(W * 0.58) : 0;
    return await sampleRegionBusyness(sharp(buf), {
      left, top: 0, width: Math.round(W * 0.42), height: Math.round(H * 0.42),
    });
  } catch {
    return 0;
  }
}

/** 取一張圖「上方／下方／左側橫帶或直條」的忙碌度（0~1）。
 *  用來判斷疊字型版型（文字直接疊在照片上）的文字塊會不會蓋到主體。
 *  zone: "top"=上方約30%高整寬, "bottom"=下方約30%高整寬, "left"=左側約45%寬整高 */
export async function sampleRegionBusynessByZone(
  imageUrl: string,
  zone: "top" | "bottom" | "left",
): Promise<number> {
  try {
    const buf = await loadBuffer(imageUrl);
    const meta = await sharp(buf).metadata();
    const W = meta.width ?? 800, H = meta.height ?? 800;
    let region: { left: number; top: number; width: number; height: number };
    if (zone === "top") {
      region = { left: 0, top: 0, width: W, height: Math.round(H * 0.3) };
    } else if (zone === "bottom") {
      region = { left: 0, top: Math.round(H * 0.7), width: W, height: Math.round(H * 0.3) };
    } else {
      region = { left: 0, top: 0, width: Math.round(W * 0.45), height: H };
    }
    return await sampleRegionBusyness(sharp(buf).removeAlpha().toColorspace("srgb"), region);
  } catch {
    return 0;
  }
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
  const { imageUrl, logoUrl, widthRatio = 0.12, textZone, position } = opts;

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

  const out = await sharp(baseBuf).composite(layers).png().toBuffer();
  return saveBuffer(out, "png", "logo-");
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
}): Promise<string> {
  const { backgroundUrl, productImageUrl, layoutType, canvasWidth, canvasHeight,
          titleText, subtitleText, seed } = opts;
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

  // 3. 文字燒入
  if (titleText?.trim() || subtitleText?.trim()) {
    const textSvg = buildTextSvg(
      canvasWidth, canvasHeight,
      titleText ?? "", subtitleText ?? "",
      pl.textZone
    );
    if (textSvg) layers.push({ input: textSvg, top: 0, left: 0 });
  }

  // 4. 輸出
  const out = await sharp(bgResized)
    .composite(layers)
    .jpeg({ quality: 93 })
    .toBuffer();

  return saveBuffer(out, "jpg", "ai-");
}
