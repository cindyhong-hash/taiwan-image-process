/* ============================================================
   Magic Layers — layered composition (server)
   THE reliable path: build editable layers AT generation time instead of
   decomposing a flattened poster. Every element stays a real, separate layer:
     - background  : the generated/chosen scene (full canvas)
     - product(s)  : BiRefNet cut-out PNGs, placed by layout (clean — single
                     product on a clean shot is exactly BiRefNet's strong case)
     - text        : TRUE editable text layers (we own the string/font/colour)
     - logo        : optional cut-out

   Output is LayerData[] that opens directly in the editor. No lossy extraction,
   no background inpaint, no text matte — because nothing was ever flattened.
   ============================================================ */
import { removeBackground } from "@/lib/fal";
import { loadBuffer, saveBuffer } from "@/lib/storage";
import sharp from "sharp";
import type { LayerData, Bbox, TextRole } from "./types.ts";

export interface ComposeTextInput { text: string; role?: TextRole; color?: string; fontSizePx?: number; fontWeight?: number; align?: "left" | "center" | "right"; }
export interface ComposeInput {
  backgroundUrl: string;
  productImageUrls?: string[];
  logoUrl?: string;
  texts?: ComposeTextInput[];        // in stacking order top->down
  canvasWidth: number;
  canvasHeight: number;
}

const FONT_STACK = "'Noto Sans TC','PingFang TC',system-ui,sans-serif";

function textLayer(id: string, z: number, t: ComposeTextInput, x: number, y: number, w: number, h: number): LayerData {
  const box: Bbox = { x, y, w, h };
  return {
    id, type: "independent_text", name: t.text.slice(0, 14) || "Text",
    semanticId: "text", instanceId: id, parentId: null,
    bbox: box, mask: null, image: null,
    x, y, width: w, height: h, rotation: 0,
    zIndex: z, confidence: 1, source: "generated", editable: true,
    embeddedText: [], children: [],
    // editable-text style the editor renders with (we KNOW the text/font/colour)
    meta: { textObject: { text: t.text }, style: {
      text: t.text, fontSizePx: t.fontSizePx ?? Math.round(h * 0.8),
      fontWeight: t.fontWeight ?? 700, color: t.color ?? "#241f47",
      align: t.align ?? "center", fontFamily: FONT_STACK,
    } },
  };
}

async function resolveBuf(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) return Buffer.from(url.split(",")[1] ?? "", "base64");
  return Buffer.from(await loadBuffer(url));
}

async function cutoutLayer(id: string, type: "product" | "object", name: string, z: number, srcUrl: string, box: Bbox): Promise<LayerData> {
  let image: string | null = null;
  let bbox = box;
  try {
    const srcBuf = await resolveBuf(srcUrl);
    // If the PNG is ALREADY transparent (user gave a cut-out), use it as-is —
    // re-running BiRefNet on an already-cut PNG breaks it.
    let cutBuf: Buffer | null = null;
    const meta = await sharp(srcBuf).metadata();
    let alreadyCut = false;
    if (meta.hasAlpha) {
      const st = await sharp(srcBuf).stats();
      const a = st.channels[st.channels.length - 1];
      alreadyCut = !!a && a.min < 250;   // has genuinely transparent pixels
    }
    cutBuf = alreadyCut ? srcBuf : (await removeBackground(srcUrl).then(c => (c ? Buffer.from(c) : null)));
    if (cutBuf) {
      // fit the cut-out into the placement box, preserving aspect
      const m = await sharp(cutBuf).metadata();
      const ar = (m.width ?? box.w) / (m.height ?? box.h);
      let w = box.w, h = Math.round(w / ar);
      if (h > box.h) { h = box.h; w = Math.round(h * ar); }
      const resized = await sharp(cutBuf).resize(w, h, { fit: "inside" }).png().toBuffer();
      image = await saveBuffer(resized, "png", "ml-compose-");
      bbox = { x: Math.round(box.x + (box.w - w) / 2), y: Math.round(box.y + (box.h - h)), w, h }; // bottom-center in box
    }
  } catch { /* keep image null */ }
  return {
    id, type, name, semanticId: type, instanceId: id, parentId: null,
    bbox, mask: null, image,
    x: bbox.x, y: bbox.y, width: bbox.w, height: bbox.h, rotation: 0,
    zIndex: z, confidence: 1, source: "segmented", editable: true,
    embeddedText: [], children: [], meta: {},
  };
}

export async function buildCompositionLayers(input: ComposeInput): Promise<LayerData[]> {
  const W = input.canvasWidth, H = input.canvasHeight;
  const layers: LayerData[] = [];
  let z = 0;

  // 1) background (full canvas). Re-save so it lives in /uploads for the editor.
  let bgImage = input.backgroundUrl;
  try { const b = await loadBuffer(input.backgroundUrl); bgImage = await saveBuffer(Buffer.from(b), "png", "ml-bg-src-"); } catch { /* use as-is */ }
  layers.push({
    id: "layer_bg", type: "background", name: "Background",
    semanticId: "background", instanceId: "background_1", parentId: null,
    bbox: { x: 0, y: 0, w: W, h: H }, mask: null, image: bgImage,
    x: 0, y: 0, width: W, height: H, rotation: 0,
    zIndex: z++, confidence: 1, source: "generated", editable: true,
    embeddedText: [], children: [], meta: {},
  });

  // 2) products — cut out + arranged in a centered row along the lower third
  const prods = input.productImageUrls ?? [];
  if (prods.length) {
    const rowY = Math.round(H * 0.55), rowH = Math.round(H * 0.38);
    const slotW = Math.round((W * 0.9) / prods.length), startX = Math.round(W * 0.05);
    const cut = await Promise.all(prods.map((u, i) =>
      cutoutLayer(`product_${i + 1}`, "product", `Product ${i + 1}`, z + i, u, { x: startX + i * slotW, y: rowY, w: slotW, h: rowH })));
    cut.forEach(l => { l.zIndex = z++; layers.push(l); });
  }

  // 3) logo (optional) — top-left cut-out
  if (input.logoUrl) {
    const lg = await cutoutLayer("logo_1", "object", "Logo", z, input.logoUrl, { x: Math.round(W * 0.04), y: Math.round(H * 0.03), w: Math.round(W * 0.22), h: Math.round(H * 0.1) });
    lg.zIndex = z++; layers.push(lg);
  }

  // 4) editable text — stacked near the top
  const texts = input.texts ?? [];
  let ty = Math.round(H * 0.06);
  texts.forEach((t, i) => {
    const h = Math.round(H * (i === 0 ? 0.10 : 0.06));
    layers.push(textLayer(`text_${i + 1}`, z++, t, Math.round(W * 0.08), ty, Math.round(W * 0.84), h));
    ty += h + Math.round(H * 0.02);
  });

  return layers;
}
