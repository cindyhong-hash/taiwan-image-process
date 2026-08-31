import { NextResponse } from "next/server";
import sharp from "sharp";
import { inpaintImageFal } from "@/lib/fal";
import { saveBuffer } from "@/lib/storage";

export const maxDuration = 180;

type Direction = "auto" | "left" | "right" | "top" | "bottom" | "center";
const RATIOS: Record<string, [number, number]> = { "1:1": [1, 1], "4:5": [4, 5], "9:16": [9, 16], "16:9": [16, 9] };

export async function POST(req: Request) {
  try {
    const body = await req.json() as { imageDataUrl?: string; width?: number; height?: number; ratio?: string; direction?: Direction; mode?: "keep" | "recompose"; variants?: number; prompt?: string };
    if (!body.imageDataUrl?.startsWith("data:image/")) return NextResponse.json({ error: "缺少畫布圖片" }, { status: 400 });
    const W = Math.max(1, Math.round(body.width ?? 0)), H = Math.max(1, Math.round(body.height ?? 0));
    const [rw, rh] = RATIOS[body.ratio ?? ""] ?? RATIOS["4:5"];
    let targetW = W, targetH = H;
    if (W / H < rw / rh) targetW = Math.ceil(H * rw / rh); else targetH = Math.ceil(W * rh / rw);
    const direction = body.direction ?? "auto";
    let left = Math.floor((targetW - W) / 2), top = Math.floor((targetH - H) / 2);
    if (direction === "left") left = targetW - W;
    if (direction === "right") left = 0;
    if (direction === "top") top = targetH - H;
    if (direction === "bottom") top = 0;
    const src = Buffer.from(body.imageDataUrl.replace(/^data:image\/\w+;base64,/, ""), "base64");
    const padded = await sharp({ create: { width: targetW, height: targetH, channels: 4, background: { r: 127, g: 127, b: 127, alpha: 1 } } })
      .composite([{ input: src, left, top }]).png().toBuffer();
    const mask = await sharp({ create: { width: targetW, height: targetH, channels: 3, background: "white" } })
      .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}"><rect width="100%" height="100%" fill="black"/></svg>`), left, top }]).png().toBuffer();
    const paddedUrl = await saveBuffer(padded, "png", "outpaint-source-");
    const maskDataUrl = `data:image/png;base64,${mask.toString("base64")}`;
    const count = Math.min(4, Math.max(2, Math.round(body.variants ?? 2)));
    const prompt = body.prompt?.trim() || (body.mode === "recompose"
      ? "Continue the photographic scene naturally into every white masked area. Improve the composition while keeping the original subject unchanged. Full-bleed photo, no blank space, no border, no frame, no text."
      : "Seamlessly continue the same photographic background into every white masked area. Match the existing horizon, lighting, colors and texture. Full-bleed photo, no blank space, no border, no frame, no text.");
    const urls = await Promise.all(Array.from({ length: count }, () => inpaintImageFal({ imageUrl: paddedUrl, maskDataUrl, prompt })));
    return NextResponse.json({ variants: urls, targetW, targetH, offsetX: left, offsetY: top });
  } catch (e) {
    console.error("[magic-layers/outpaint]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "擴圖失敗" }, { status: 500 });
  }
}
