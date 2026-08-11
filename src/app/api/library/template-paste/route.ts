import { NextResponse } from "next/server";
import sharp from "sharp";
import { falRemoveBg, falRelightComposite } from "@/lib/generate";
import { loadBuffer, saveBuffer } from "@/lib/storage";

/**
 * POST /api/library/template-paste — 固定模板貼圖（系列圖一致性方案 A）
 * ──────────────────────────────────────────────────────────────────
 * 決定性合成：把產品去背後，貼喺「固定背景」嘅「固定位置/尺寸」（placement）。
 * 唔經生成式模型 → 同一系列每張背景 100% 一樣、產品同一大小同一位、零腦補元素、中文字真像素。
 * body: { bgImageUrl, productImageUrl, placement:{scale,x,y}, size?, shadow? }
 *   • placement.scale = 產品高度佔畫布高度比例（0–1）
 *   • placement.x / y = 產品中心位置（0–1，相對畫布）
 * 回傳 { imageUrl }（draft；唔入庫，client 揀完用 save-image）。
 */

async function loadImageBuffer(url: string, host: string): Promise<Buffer> {
  if (url.startsWith("/uploads/")) return loadBuffer(url);
  const abs = url.startsWith("http") ? url : `${host}${url}`;
  const res = await fetch(abs, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`無法載入圖片：${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function POST(request: Request) {
  try {
    const { bgImageUrl, productImageUrl, placement, size, shadow, harmonize } = (await request.json()) ?? {};
    if (!bgImageUrl || !productImageUrl) {
      return NextResponse.json({ error: "缺少背景圖或產品圖" }, { status: 400 });
    }
    const host = new URL(request.url).origin;
    const outW = size === "landscape" ? 1800 : 1200;
    const outH = 1200;
    const scale = Math.min(0.95, Math.max(0.1, placement?.scale ?? 0.6));
    const cxR = Math.min(1, Math.max(0, placement?.x ?? 0.5));
    const cyR = Math.min(1, Math.max(0, placement?.y ?? 0.6));

    // 背景（cover 到畫布）
    const base = await sharp(await loadImageBuffer(bgImageUrl, host)).resize(outW, outH, { fit: "cover" }).toBuffer();

    // 產品去背（真像素）→ 縮到固定高度
    const prodSrc = await loadImageBuffer(productImageUrl, host);
    const cut = await falRemoveBg(`data:image/png;base64,${(await sharp(prodSrc).png().toBuffer()).toString("base64")}`);
    const targetH = Math.round(outH * scale);
    const prod = await sharp(cut).resize({ height: targetH, fit: "inside", withoutEnlargement: false }).png().toBuffer();
    const pm = await sharp(prod).metadata();
    const pw = pm.width ?? 0, ph = pm.height ?? 0;
    const left = Math.round(cxR * outW - pw / 2);
    const top = Math.round(cyR * outH - ph / 2);

    const layers: sharp.OverlayOptions[] = [];
    if (shadow !== false) {
      // (1) 接地接觸陰影：產品底部柔和橢圓 → 解決「浮空」感（最關鍵）。
      const ellH = Math.max(8, Math.round(ph * 0.10));
      const ellSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ellH * 2}"><ellipse cx="${pw / 2}" cy="${ellH}" rx="${Math.round(pw * 0.42)}" ry="${Math.round(ellH * 0.7)}" fill="black" fill-opacity="0.42"/></svg>`;
      const contact = await sharp(Buffer.from(ellSvg)).blur(9).png().toBuffer();
      layers.push({ input: contact, left: Math.max(0, left), top: Math.max(0, top + ph - ellH) });
      // (2) 柔投射陰影：產品剪影 → 模糊 → 半透明，輕微偏移（環境光感）。
      const alphaMask = await sharp(prod).extractChannel("alpha").blur(22).linear(0.22, 0).toBuffer();
      const dropShadow = await sharp({ create: { width: pw, height: ph, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .joinChannel(alphaMask).png().toBuffer();
      layers.push({ input: dropShadow, left: Math.max(0, left + Math.round(pw * 0.03)), top: Math.max(0, top + Math.round(ph * 0.05)) });
    }
    layers.push({ input: prod, left: Math.max(0, left), top: Math.max(0, top) });

    let out = await sharp(base).composite(layers).png().toBuffer();

    // 可選 AI 融合打光（opt-in）：貼好後再 relight，令光影更自然（有少少 drift 風險）。
    if (harmonize === true) {
      try {
        const dataUri = `data:image/jpeg;base64,${(await sharp(out).jpeg({ quality: 92 }).toBuffer()).toString("base64")}`;
        const relit = await falRelightComposite(dataUri, size === "landscape" ? "3:2" : "1:1");
        out = await sharp(relit.buffer).resize(outW, outH, { fit: "cover" }).png().toBuffer();
      } catch (e) {
        console.error("[template-paste] harmonize failed, 用純貼圖:", e instanceof Error ? e.message : e);
      }
    }
    return NextResponse.json({ imageUrl: await saveBuffer(out, "png") });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[template-paste] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
