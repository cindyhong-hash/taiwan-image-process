/* ============================================================
   POST /api/magic-layers
   Real Magic Layers analysis (server): OpenRouter VLM detects semantic objects,
   fal SAM2 (primary) / BiRefNet (fallback) cuts each along its contour, then the
   shared pipeline groups + classifies text + validates fragmentation.

   Body: { imageDataUrl: string, width: number, height: number }
   Returns: { layers, textObjects, fragmentation, meta } | { error }

   Requires .env.local: OPENROUTER_API_KEY, FAL_KEY.
   Optional: ML_MASK_PRIMARY=sam2 (default birefnet), FAL_SAM2_MODEL.
   ============================================================ */
import { NextResponse } from "next/server";
import { analyze } from "@/lib/magic-layers/analysis.ts";
import { OpenRouterDetector } from "@/lib/magic-layers/openrouter-detector.ts";
import { BiRefNetMaskProvider, Sam2MaskProvider } from "@/lib/magic-layers/mask-providers/fal.ts";
import { FallbackMaskProvider } from "@/lib/magic-layers/mask-providers/mock.ts";
import { reconstructBackground } from "@/lib/magic-layers/background-inpaint.ts";
import { matteText } from "@/lib/magic-layers/text-matte.ts";
import { saveBuffer } from "@/lib/storage";

export const maxDuration = 120;

function dataUrlToBuffer(u: string): Buffer { return Buffer.from((u.split(",")[1] ?? ""), "base64"); }

export async function POST(request: Request) {
  try {
    if (!process.env.OPENROUTER_API_KEY) return NextResponse.json({ error: "缺少 OPENROUTER_API_KEY，請在 .env.local 設定" }, { status: 400 });
    if (!process.env.FAL_KEY) return NextResponse.json({ error: "缺少 FAL_KEY，請在 .env.local 設定" }, { status: 400 });

    const { imageDataUrl, width, height, inpaintBackground } = await request.json();
    if (!imageDataUrl || !width || !height) return NextResponse.json({ error: "missing imageDataUrl/width/height" }, { status: 400 });

    // BiRefNet is primary — it returns real silhouettes. (SAM2's fal response
    // shape produced opaque-rectangle masks here, so it's opt-in until verified:
    // ML_MASK_PRIMARY=sam2 to try SAM2-first with BiRefNet fallback.)
    const birefnet = BiRefNetMaskProvider();
    const maskProvider = process.env.ML_MASK_PRIMARY === "sam2"
      ? FallbackMaskProvider(Sam2MaskProvider(), birefnet)
      : birefnet;

    const res = await analyze(
      { url: imageDataUrl, width: Number(width), height: Number(height) },
      { detector: OpenRouterDetector(), maskProvider },
    );

    // Transparent text cut-outs: matte each independent-text box so the original
    // stylised lettering drags cleanly (no rectangle). Falls back to the client
    // rect-crop when the matte is unconvincing (image stays null). No API cost.
    const origBuf = dataUrlToBuffer(imageDataUrl);
    await Promise.all(res.layers.filter(l => l.type === "independent_text").map(async (l) => {
      const m = await matteText(origBuf, l.bbox, Number(width), Number(height));
      if (m) {
        const url = await saveBuffer(m.buffer, "png", "ml-text-");
        l.image = url; l.bbox = m.box; l.mask = null;
        l.x = m.box.x; l.y = m.box.y; l.width = m.box.w; l.height = m.box.h;
      }
    }));
    // If a text couldn't be cleanly matted (no image), DROP the layer — it stays
    // baked in the background rather than showing as an ugly opaque rectangle.
    res.layers = res.layers.filter(l => l.type !== "independent_text" || !!l.image);

    // Step 12 (opt-in): reconstruct a clean background so moving an object
    // reveals repaired pixels. Premium fal call — only when requested.
    let backgroundInpainted = false;
    if (inpaintBackground) {
      const cleanUrl = await reconstructBackground(imageDataUrl, res.objects, Number(width), Number(height));
      if (cleanUrl) {
        const bg = res.layers.find(l => l.type === "background");
        if (bg) { bg.image = cleanUrl; bg.name = "Background (clean)"; }
        backgroundInpainted = true;
      }
    }

    return NextResponse.json({
      layers: res.layers,
      textObjects: res.textObjects,
      fragmentation: res.fragmentation,
      quality: res.quality,
      meta: { ...res.meta, objectCount: res.objects.length, regionCount: res.regions.length, backgroundInpainted },
    });
  } catch (err) {
    console.error("[magic-layers] analysis failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
