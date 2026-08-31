import { NextResponse } from "next/server";
import { inpaintImageFal } from "@/lib/fal";
import { saveBuffer } from "@/lib/storage";

export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = await req.json() as { imageDataUrl?: string; maskDataUrl?: string; variants?: number };
    if (!body.imageDataUrl?.startsWith("data:image/") || !body.maskDataUrl?.startsWith("data:image/")) return NextResponse.json({ error: "缺少圖片或空白區遮罩" }, { status: 400 });
    const src = Buffer.from(body.imageDataUrl.split(",")[1] ?? "", "base64");
    const sourceUrl = await saveBuffer(src, "png", "magic-fill-source-");
    const count = Math.min(4, Math.max(2, Math.round(body.variants ?? 2)));
    const prompt = "Fill every white masked area by seamlessly continuing the existing photographic scene. Match perspective, horizon, lighting, colors and texture. Full-bleed photo, no blank space, no border, no frame, no text.";
    const variants = await Promise.all(Array.from({ length: count }, () => inpaintImageFal({ imageUrl: sourceUrl, maskDataUrl: body.maskDataUrl!, prompt })));
    return NextResponse.json({ variants });
  } catch (e) {
    console.error("[magic-layers/magic-fill]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "魔術棒補空白失敗" }, { status: 500 });
  }
}
