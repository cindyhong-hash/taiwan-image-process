import sharp from "sharp";

type Rgb = { r: number; g: number; b: number };
type NormalizedRect = { x: number; y: number; w: number; h: number };

function parseColor(value: string, fallback: Rgb): Rgb {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return fallback;
  const raw = match[1].length === 3 ? match[1].split("").map((part) => `${part}${part}`).join("") : match[1];
  return { r: Number.parseInt(raw.slice(0, 2), 16), g: Number.parseInt(raw.slice(2, 4), 16), b: Number.parseInt(raw.slice(4, 6), 16) };
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgb): number {
  return 0.2126 * channelLuminance(color.r) + 0.7152 * channelLuminance(color.g) + 0.0722 * channelLuminance(color.b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function resolveTextTreatment(backgroundColor: string, brandColor: string) {
  const background = parseColor(backgroundColor, { r: 248, g: 249, b: 252 });
  const dark = { r: 36, g: 31, b: 71 };
  const white = { r: 255, g: 255, b: 255 };
  const textColor = contrast(dark, background) >= contrast(white, background) ? "#241f47" : "#ffffff";
  const accent = parseColor(brandColor, { r: 109, g: 74, b: 255 });
  const accentColor = `#${[accent.r, accent.g, accent.b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  return { textColor, accentColor };
}

export async function prepareAdBackground(source: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(source)
    .resize(width, height, { fit: "cover", position: "attention" })
    .flatten({ background: { r: 248, g: 249, b: 252 } })
    .png()
    .toBuffer();
}

export async function averageBackgroundColor(source: Buffer): Promise<string> {
  const stats = await sharp(source).stats();
  const [red, green, blue] = stats.channels;
  return `#${[red, green, blue].map((channel) => Math.round(channel.mean).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Decide copy contrast from the real template text zone rather than the average
 * of a whole scene. A panel is only required when neither safe dark copy nor
 * safe white copy reaches the usual 4.5:1 contrast target.
 */
export async function resolveTextSafeTreatment(source: Buffer, zone: NormalizedRect, brandColor: string) {
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const left = Math.max(0, Math.min(width - 1, Math.round(zone.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(zone.y * height)));
  const cropWidth = Math.max(1, Math.min(width - left, Math.round(zone.w * width)));
  const cropHeight = Math.max(1, Math.min(height - top, Math.round(zone.h * height)));
  const crop = await sharp(source).extract({ left, top, width: cropWidth, height: cropHeight }).png().toBuffer();
  const background = parseColor(await averageBackgroundColor(crop), { r: 248, g: 249, b: 252 });
  const dark = { r: 36, g: 31, b: 71 };
  const white = { r: 255, g: 255, b: 255 };
  const darkContrast = contrast(dark, background);
  const lightContrast = contrast(white, background);
  const textColor = darkContrast >= lightContrast ? "#241f47" : "#ffffff";
  const panelTreatment = Math.max(darkContrast, lightContrast) >= 4.5
    ? "none"
    : textColor === "#ffffff" ? "dark-panel" : "light-panel";
  return { ...resolveTextTreatment(`#${[background.r, background.g, background.b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`, brandColor), textColor, panelTreatment };
}
