/* ============================================================
   POST /api/magic-layers/compose
   Layered composition -> editable LayerData[] (the reliable "generate as layers"
   path). Background can be AI-generated from a prompt, or supplied as a URL.
   Body: { backgroundUrl?|backgroundPrompt?, ratio?, productImageUrls?, logoUrl?,
           texts?, canvasWidth?, canvasHeight? }
   Returns: { layers, backgroundUrl, canvasWidth, canvasHeight } | { error }
   Requires FAL_KEY (bg generation + product cut-outs).
   ============================================================ */
import { NextResponse } from "next/server";
import { buildCompositionLayers, type ComposeInput } from "@/lib/magic-layers/compose-layers.ts";
import { generateImageFal } from "@/lib/fal";
import { loadBuffer, saveBuffer } from "@/lib/storage";
import sharp from "sharp";

export const maxDuration = 120;

const RATIO_SIZE: Record<string, [number, number]> = {
  "1:1": [1024, 1024], "4:5": [1024, 1280], "3:4": [960, 1280],
  "16:9": [1280, 720], "9:16": [720, 1280], "4:3": [1280, 960],
};

export async function POST(request: Request) {
  try {
    if (!process.env.FAL_KEY) return NextResponse.json({ error: "缺少 FAL_KEY（背景生成/產品去背需要）" }, { status: 400 });
    const body = (await request.json()) as ComposeInput & { backgroundPrompt?: string; ratio?: string; fitMode?: "cover" | "contain" };
    const ratio = body.ratio ?? "1:1";
    const [dw, dh] = RATIO_SIZE[ratio] ?? [1024, 1024];
    let canvasWidth = body.canvasWidth || dw;
    let canvasHeight = body.canvasHeight || dh;

    let backgroundUrl = body.backgroundUrl;
    const bgProvided = !!backgroundUrl;   // supplied (upload / 素材庫) vs AI-generated
    if (!backgroundUrl && body.backgroundPrompt) {
      backgroundUrl = await generateImageFal({ prompt: body.backgroundPrompt, imageRatio: ratio, seed: `ml-bg-${canvasWidth}x${canvasHeight}` });
    }
    if (!backgroundUrl) return NextResponse.json({ error: "需要 backgroundUrl 或 backgroundPrompt" }, { status: 400 });

    // fitMode="contain"（自由排版：使用者先選底圖、再選畫布尺寸）：以選定比例為畫布，
    // 底圖置中、四周白底留白、不裁切。先把底圖白底 contain 到畫布尺寸，再走原本「底圖填滿」流程。
    if (bgProvided && body.fitMode === "contain") {
      canvasWidth = dw; canvasHeight = dh;
      try {
        const buf = backgroundUrl.startsWith("data:")
          ? Buffer.from(backgroundUrl.split(",")[1] ?? "", "base64")
          : Buffer.from(await loadBuffer(backgroundUrl));
        const padded = await sharp(buf)
          .resize(dw, dh, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .png().toBuffer();
        backgroundUrl = await saveBuffer(padded, "png", "ml-bg-contain-");
      } catch { /* 失敗就用原圖（底圖填滿） */ }
    } else if (bgProvided && !body.canvasWidth && !body.canvasHeight) {
      // A supplied background can be any size (素材庫 / 上傳). Use its REAL dimensions as
      // the canvas so text/product layer coords line up (AI-generated bg already == ratio).
      try {
        const buf = backgroundUrl.startsWith("data:")
          ? Buffer.from(backgroundUrl.split(",")[1] ?? "", "base64")
          : Buffer.from(await loadBuffer(backgroundUrl));
        const m = await sharp(buf).metadata();
        if (m.width && m.height) { canvasWidth = m.width; canvasHeight = m.height; }
      } catch { /* keep ratio size */ }
    }

    const layers = await buildCompositionLayers({ ...body, backgroundUrl, canvasWidth, canvasHeight });
    return NextResponse.json({ layers, backgroundUrl: layers[0]?.image ?? backgroundUrl, canvasWidth, canvasHeight });
  } catch (err) {
    console.error("[magic-layers/compose] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
