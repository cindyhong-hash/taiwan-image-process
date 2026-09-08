import sharp from "sharp";

type Rgb = { r: number; g: number; b: number };

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
