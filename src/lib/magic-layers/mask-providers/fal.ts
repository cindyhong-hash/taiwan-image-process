/* ============================================================
   Magic Layers — REAL mask providers (server, fal.ai)

   Whole-object segmentation → ONE transparent cut-out per object.
   - bbox is padded per object type first (keeps hair / shadow / reflection).
   - BiRefNet: crop padded bbox from the full-res original → matting.
   - SAM2: box-prompt on padded box → mask → composite → cut-out.
   - both run cleanMask() (de-fringe + type feather) and return a single alphaUrl.

   Resolution preserved (crop from full-res source). No alphaUrls arrays.
   ============================================================ */
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { removeBackground } from "@/lib/fal";
import { saveBuffer, loadBuffer } from "@/lib/storage";
import type { MaskProvider, MaskResult, SegmentPrompt, LayerType } from "./../types.ts";
import { cleanMask, featherFor } from "./../mask-postprocess.ts";

// Step 2 — padding (fraction of bbox) per type. Keeps shadows/reflections/hair.
// Padding (fraction of bbox) per type. Generous on products/objects so a loose
// VLM box still contains the WHOLE item (avoids "cut in half"); BiRefNet then
// keeps only the salient object inside the crop.
const PADDING: Record<LayerType, number> = {
  person: 0.22, product: 0.28, object: 0.24, decoration: 0.18, background: 0, independent_text: 0,
};

function initFal() { const key = process.env.FAL_KEY; if (!key) throw new Error("FAL_KEY is not set"); fal.config({ credentials: key }); }
async function toBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) return Buffer.from(url.split(",")[1] ?? "", "base64");
  return Buffer.from(await loadBuffer(url));
}
/** Expand bbox by the type padding, clamped to the image. */
function expandBox(b: SegmentPrompt["bbox"], type: LayerType | undefined, W: number, H: number) {
  const pad = PADDING[type ?? "object"] ?? 0.12;
  const padX = b.w * pad, padY = b.h * pad;
  const x = Math.max(0, Math.floor(b.x - padX)), y = Math.max(0, Math.floor(b.y - padY));
  const right = Math.min(W, Math.ceil(b.x + b.w + padX)), bottom = Math.min(H, Math.ceil(b.y + b.h + padY));
  return { left: x, top: y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/** Reliable: crop padded bbox → BiRefNet → cleaned transparent cut-out. */
export function BiRefNetMaskProvider(): MaskProvider {
  return {
    name: "BiRefNetMaskProvider",
    async segment(image, prompt): Promise<MaskResult> {
      const buf = await toBuffer(image.url);
      const ex = expandBox(prompt.bbox, prompt.type, image.width, image.height);
      const crop = await sharp(buf).extract(ex).png().toBuffer();
      const raw = await removeBackground(`data:image/png;base64,${crop.toString("base64")}`);
      if (!raw) throw new Error("BiRefNet returned no cutout");
      const cleaned = await cleanMask(Buffer.from(raw), featherFor(prompt.type ?? "object"));
      const url = await saveBuffer(cleaned, "png", "ml-");
      const bbox = { x: ex.left, y: ex.top, w: ex.width, h: ex.height };
      return { mask: { kind: "alpha", alphaUrl: url, bbox, feather: featherFor(prompt.type ?? "object") }, bbox, confidence: 0.9, source: "birefnet", width: image.width, height: image.height };
    },
  };
}

/** Primary: fal SAM2 box-prompt → composite → cleaned cut-out. Strictly validated. */
export function Sam2MaskProvider(): MaskProvider {
  const MODEL = process.env.FAL_SAM2_MODEL ?? "fal-ai/sam2/image";
  // Upload the source to fal ONCE per request (SAM2 needs a real URL, not a
  // data: URI); dedupe concurrent object segments onto one upload.
  let uploading: Promise<string> | null = null;
  const uploadOnce = (image: { url: string }): Promise<string> => {
    if (!uploading) uploading = toBuffer(image.url).then(buf => fal.storage.upload(new File([buf], "src.png", { type: "image/png" })));
    return uploading;
  };
  return {
    name: "Sam2MaskProvider",
    async segment(image, prompt): Promise<MaskResult> {
      initFal();
      const W = image.width, H = image.height;
      const ex = expandBox(prompt.bbox, prompt.type, W, H);
      const box = { x_min: ex.left, y_min: ex.top, x_max: ex.left + ex.width, y_max: ex.top + ex.height };
      const imageUrl = await uploadOnce(image);
      const out = (await fal.run(MODEL, { input: { image_url: imageUrl, box_prompts: [box] } })) as { data?: { image?: { url?: string } } };
      const maskUrl = out?.data?.image?.url;
      if (!maskUrl) throw new Error("SAM2 returned no mask url");

      // SAM2's mask = 1-channel PNG, white(255)=object, black(0)=background.
      // Composite via RAW buffers (explicit alpha) — the joinChannel-on-PNG path
      // silently drops alpha and yields opaque rectangles, so do NOT use it.
      const [orig, maskBuf] = await Promise.all([toBuffer(image.url), fetch(maskUrl).then(r => r.arrayBuffer()).then(a => Buffer.from(a))]);
      const rgb = await sharp(orig).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const mask = await sharp(maskBuf).resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer();
      const rgba = Buffer.alloc(W * H * 4);
      let opaque = 0;
      for (let p = 0; p < W * H; p++) {
        rgba[p * 4] = rgb.data[p * 3]; rgba[p * 4 + 1] = rgb.data[p * 3 + 1]; rgba[p * 4 + 2] = rgb.data[p * 3 + 2];
        const a = mask[p]; rgba[p * 4 + 3] = a; if (a > 20) opaque++;
      }
      if (opaque / (W * H) > 0.92) throw new Error("SAM2 mask looks like a full rectangle"); // guard -> BiRefNet
      const full = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
      const cropped = await sharp(full).extract(ex).png().toBuffer();
      const url = await saveBuffer(cropped, "png", "ml-sam-");
      const bbox = { x: ex.left, y: ex.top, w: ex.width, h: ex.height };
      return { mask: { kind: "alpha", alphaUrl: url, bbox, feather: featherFor(prompt.type ?? "object") }, bbox, confidence: 0.92, source: "sam2", width: W, height: H };
    },
  };
}
