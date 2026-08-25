/* ============================================================
   Magic Layers — Background reconstruction (server, fal LaMa)
   Removes the detected foreground objects from the original and inpaints the
   holes, producing a clean background plate. Set as the background layer's image
   so dragging an object reveals repaired pixels (Canva/PS-style base plate).

   Uses fal-ai/lama (object-removal inpainting; no prompt needed, available on a
   standard fal account). Opt-in per request.
   ============================================================ */
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { saveBuffer } from "@/lib/storage";
import type { Bbox } from "./types.ts";

function initFal() { const k = process.env.FAL_KEY; if (!k) throw new Error("FAL_KEY is not set"); fal.config({ credentials: k }); }
function dataUrlToBuffer(u: string): Buffer { return Buffer.from((u.split(",")[1] ?? ""), "base64"); }

/** white-on-black mask (white = remove/inpaint) over the object bboxes, dilated. */
async function buildObjectMask(objects: { bbox: Bbox }[], W: number, H: number): Promise<Buffer> {
  const rects = objects.map(o => {
    const pad = Math.round(Math.min(o.bbox.w, o.bbox.h) * 0.08);
    const x = Math.max(0, Math.round(o.bbox.x - pad)), y = Math.max(0, Math.round(o.bbox.y - pad));
    const w = Math.min(W - x, Math.round(o.bbox.w + pad * 2)), h = Math.min(H - y, Math.round(o.bbox.h + pad * 2));
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${pad}" fill="white"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="black"/>${rects}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Returns a clean-background image URL, or null if nothing to remove / on failure. */
export async function reconstructBackground(
  imageDataUrl: string,
  objects: { bbox: Bbox }[],
  W: number,
  H: number,
): Promise<string | null> {
  const removable = objects.filter(o => o.bbox.w > 4 && o.bbox.h > 4);
  if (!removable.length) return null;
  try {
    initFal();
    const imgBuf = dataUrlToBuffer(imageDataUrl);
    const maskBuf = await buildObjectMask(removable, W, H);
    const [imageUrl, maskUrl] = await Promise.all([
      fal.storage.upload(new File([imgBuf], "img.png", { type: "image/png" })),
      fal.storage.upload(new File([maskBuf], "mask.png", { type: "image/png" })),
    ]);
    const r = await fal.run("fal-ai/lama", { input: { image_url: imageUrl, mask_image_url: maskUrl } }) as { data?: { image?: { url?: string } }; image?: { url?: string } };
    const url = r?.data?.image?.url ?? r?.image?.url;
    if (!url) return null;
    const out = Buffer.from(await (await fetch(url)).arrayBuffer());
    return await saveBuffer(out, "png", "ml-bg-");
  } catch (e) {
    console.warn("[magic-layers] LaMa background inpaint failed:", (e as { status?: number })?.status, (e as { message?: string })?.message);
    return null;
  }
}
