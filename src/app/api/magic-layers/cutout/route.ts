/* ============================================================
   POST /api/magic-layers/cutout
   Cut out a single uploaded product so it can be added as a new layer
   INSIDE the editor (the compose flow does this at generation time; this is
   the "＋ 加入產品" button's server side).
   Body: { imageDataUrl: string }
   Returns: { url, width, height } | { error }
   Requires FAL_KEY (BiRefNet). Skips re-cutting an already-transparent PNG.
   ============================================================ */
import { NextResponse } from "next/server";
import { removeBackground } from "@/lib/fal";
import { saveBuffer } from "@/lib/storage";
import sharp from "sharp";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!process.env.FAL_KEY) return NextResponse.json({ error: "缺少 FAL_KEY（產品去背需要）" }, { status: 400 });
    const { imageDataUrl } = await request.json();
    if (!imageDataUrl || typeof imageDataUrl !== "string") return NextResponse.json({ error: "missing imageDataUrl" }, { status: 400 });

    const srcBuf = Buffer.from((imageDataUrl.split(",")[1] ?? ""), "base64");

    // If the PNG is already transparent (user uploaded a cut-out), keep it —
    // re-running BiRefNet on an already-cut PNG breaks it.
    let alreadyCut = false;
    const meta = await sharp(srcBuf).metadata();
    if (meta.hasAlpha) {
      const st = await sharp(srcBuf).stats();
      const a = st.channels[st.channels.length - 1];
      alreadyCut = !!a && a.min < 250;
    }

    const cutBuf = alreadyCut ? srcBuf : await removeBackground(imageDataUrl).then((c) => (c ? Buffer.from(c) : null));
    if (!cutBuf) return NextResponse.json({ error: "去背失敗" }, { status: 500 });

    const png = await sharp(cutBuf).png().toBuffer();
    const m = await sharp(png).metadata();
    const url = await saveBuffer(png, "png", "ml-add-");
    return NextResponse.json({ url, width: m.width ?? 0, height: m.height ?? 0 });
  } catch (err) {
    console.error("[magic-layers/cutout] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
