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

// ── AI 幫我排版：用商品素材包 + 用途，排成一張「~80% 完成」的可編輯設計稿 ──────────
// 每個素材都是獨立圖層（背景/商品主體/裝飾/質地/文字/Logo），進編輯器後可拖拉/縮放/換素材。
export interface AdLayoutInput {
  backgroundUrl: string;          // 情境背景（呼叫端已 contain-fit 到畫布）
  heroUrl?: string;               // 商品主體（透明 PNG）
  decorationUrl?: string;         // 裝飾元素（透明 PNG）
  textureUrl?: string;            // 質地細節
  logoUrl?: string;
  title?: string;
  subtitle?: string;
  brandColor?: string;            // 品牌主色（文字用）
  purpose?: "product" | "benefit" | "scene" | "promo";
  canvasWidth: number;
  canvasHeight: number;
}

export async function buildAdLayoutLayers(input: AdLayoutInput): Promise<LayerData[]> {
  const W = input.canvasWidth, H = input.canvasHeight;
  const purpose = input.purpose ?? "product";
  const layers: LayerData[] = [];
  let z = 0;

  // 1) 背景（滿版）
  let bgImage = input.backgroundUrl;
  try { const b = await loadBuffer(input.backgroundUrl); bgImage = await saveBuffer(Buffer.from(b), "png", "ml-adbg-"); } catch { /* use as-is */ }
  layers.push({
    id: "layer_bg", type: "background", name: "Background",
    semanticId: "background", instanceId: "background_1", parentId: null,
    bbox: { x: 0, y: 0, w: W, h: H }, mask: null, image: bgImage,
    x: 0, y: 0, width: W, height: H, rotation: 0,
    zIndex: z++, confidence: 1, source: "generated", editable: true,
    embeddedText: [], children: [], meta: {},
  });

  // 2) 質地細節（小塊點綴，左下角，墊在商品後面）
  if (input.textureUrl) {
    const box = { x: Math.round(W * 0.04), y: Math.round(H * 0.60), w: Math.round(W * 0.26), h: Math.round(H * 0.26) };
    const l = await cutoutLayer("texture_1", "object", "Texture", z, input.textureUrl, box);
    l.zIndex = z++; layers.push(l);
  }

  // 3) 商品主體（主角）：用途影響大小/位置
  if (input.heroUrl) {
    const heroBox = purpose === "scene"
      ? { x: Math.round(W * 0.30), y: Math.round(H * 0.45), w: Math.round(W * 0.44), h: Math.round(H * 0.42) }
      : purpose === "benefit"
        ? { x: Math.round(W * 0.28), y: Math.round(H * 0.42), w: Math.round(W * 0.46), h: Math.round(H * 0.46) }
        : { x: Math.round(W * 0.22), y: Math.round(H * 0.36), w: Math.round(W * 0.56), h: Math.round(H * 0.56) }; // product/promo：大、置中
    const l = await cutoutLayer("product_1", "product", "商品主體", z, input.heroUrl, heroBox);
    l.zIndex = z++; layers.push(l);
  }

  // 4) 裝飾元素（右上角點綴，前景）
  if (input.decorationUrl) {
    const box = { x: Math.round(W * 0.62), y: Math.round(H * 0.03), w: Math.round(W * 0.34), h: Math.round(H * 0.24) };
    const l = await cutoutLayer("decoration_1", "object", "Decoration", z, input.decorationUrl, box);
    l.zIndex = z++; layers.push(l);
  }

  // 5) 文字（標題/副標，左上；促銷用途字更大）
  const titleH = Math.round(H * (purpose === "promo" ? 0.12 : 0.10));
  const subH = Math.round(H * 0.06);
  let ty = Math.round(H * 0.07);
  if (input.title) {
    layers.push(textLayer("text_title", z++, { text: input.title, color: input.brandColor || "#241f47", fontWeight: 800, align: "left" }, Math.round(W * 0.07), ty, Math.round(W * 0.7), titleH));
    ty += titleH + Math.round(H * 0.015);
  }
  if (input.subtitle) {
    layers.push(textLayer("text_sub", z++, { text: input.subtitle, color: input.brandColor || "#6b6785", fontWeight: 600, align: "left" }, Math.round(W * 0.07), ty, Math.round(W * 0.64), subH));
  }

  // 6) Logo（右下小）
  if (input.logoUrl) {
    const box = { x: Math.round(W * 0.72), y: Math.round(H * 0.88), w: Math.round(W * 0.24), h: Math.round(H * 0.09) };
    const l = await cutoutLayer("logo_1", "object", "Logo", z, input.logoUrl, box);
    l.zIndex = z++; layers.push(l);
  }

  return layers;
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
