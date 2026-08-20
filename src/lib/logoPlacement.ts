/**
 * logoPlacement.ts — 自由定位 Logo 合成（手動拖放版）
 *
 * 與 composite.ts 的 overlayLogo 不同：overlayLogo 是「自動選角落」的智慧貼標，
 * 這裡是使用者在 LogoPlacerModal 上「手動拖放 + 縮放」後的精準像素合成。
 * buffers 進、buffer 出，無 I/O，可測。port 自 open-beauty 的 renderLogoComposite。
 */
import sharp from "sharp";

// 預設 logo 寬度 = 畫布寬的 16%；使用者可透過 scale 微調。
export const LOGO_WIDTH_FRAC = 0.16;

/**
 * logo 在畫布上的自由放置。
 * - x, y: logo 中心點的相對位置（0..1）。0.5/0.5 = 正中央。
 *   用百分比而非像素，適應任意解析度——預覽尺寸 ≠ 實際圖片尺寸。
 * - scale: logo 寬度相對於 LOGO_WIDTH_FRAC 的倍數（默認 1.0）。
 */
export interface LogoPlacement {
  x: number;
  y: number;
  scale?: number;
}

/** 柔和投影設定。默認關閉——多數圖背景有足夠對比可直接貼。 */
export interface ShadowConfig {
  enabled: boolean;
  blur: number;    // 高斯模糊半徑（像素）
  opacity: number; // 0..1
  offset: { x: number; y: number };
}

export const DEFAULT_SHADOW: ShadowConfig = {
  enabled: false,
  blur: 12,
  opacity: 0.3,
  offset: { x: 0, y: 4 },
};

export interface LogoCompositeResult {
  buffer: Buffer;
}

/**
 * 決定性合成 logo（buffers 進、buffer 出，無 I/O）。
 * sharp 貼原始像素、不交給生圖模型重繪，保真度高。
 */
export async function renderLogoComposite(
  baseBuf: Buffer,
  logoBuf: Buffer,
  placement: LogoPlacement,
  shadow: ShadowConfig = DEFAULT_SHADOW,
): Promise<LogoCompositeResult> {
  const { width: canvasW = 1024, height: canvasH = 1024 } = await sharp(baseBuf).metadata();

  const scaleFactor = placement.scale ?? 1;
  const logoW = Math.max(1, Math.round(canvasW * LOGO_WIDTH_FRAC * scaleFactor));
  const resizedLogo = await sharp(logoBuf).resize({ width: logoW }).toBuffer();
  const { height: logoH = logoW } = await sharp(resizedLogo).metadata();

  // 中心點座標 → 左上角座標（sharp composite 需要左上角），夾在畫布內。
  const left = Math.max(0, Math.min(Math.round(placement.x * canvasW - logoW / 2), canvasW - logoW));
  const top = Math.max(0, Math.min(Math.round(placement.y * canvasH - logoH / 2), canvasH - logoH));

  const overlays: sharp.OverlayOptions[] = [];

  // 可選柔和投影：用 logo 形狀（flatten 成黑塊）模糊後半透明疊在 logo 下層。
  if (shadow.enabled) {
    try {
      const shadowBuf = await sharp(resizedLogo)
        .flatten({ background: { r: 0, g: 0, b: 0 } })
        .blur(shadow.blur)
        .composite([{
          input: Buffer.from([0, 0, 0, Math.round(255 * (1 - shadow.opacity))]),
          blend: "dest-in",
        }])
        .png()
        .toBuffer();
      const sLeft = Math.max(0, Math.min(left + shadow.offset.x, canvasW - 1));
      const sTop = Math.max(0, Math.min(top + shadow.offset.y, canvasH - 1));
      overlays.push({ input: shadowBuf, left: sLeft, top: sTop });
    } catch (e) {
      console.warn("[logoPlacement] shadow failed, direct paste:", e);
    }
  }

  overlays.push({ input: resizedLogo, left, top });

  const buffer = await sharp(baseBuf).composite(overlays).png().toBuffer();
  return { buffer };
}
