import { NextResponse } from "next/server";
import { renderLogoComposite, type LogoPlacement, type ShadowConfig, DEFAULT_SHADOW } from "@/lib/logoPlacement";
import { loadBuffer, saveBuffer } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

/** 取得圖片 buffer：data URI 直接解碼，其餘（/uploads 本地、blob/http 遠端）交給 loadBuffer。 */
async function bufferFrom(url: string): Promise<Buffer> {
  const m = url.match(/^data:[^;]+;base64,(.+)$/);
  if (m) return Buffer.from(m[1], "base64");
  return loadBuffer(url) as Promise<Buffer>;
}

type Body = {
  imageUrl: string;   // 底圖（/uploads、blob、或 http）
  logoUrl: string;    // logo（data URI 或 URL）
  x: number;          // 0..1 中心點 X
  y: number;          // 0..1 中心點 Y
  scale?: number;     // 寬度倍數（默認 1）
  shadow?: boolean;   // 柔和投影
};

/**
 * 手動放置 logo：由 LogoPlacerModal（拖放預覽）確認後呼叫。
 * 用 sharp 精準像素合成（不經 AI 重繪），回傳合成後圖片 URL。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if (!body.imageUrl || !body.logoUrl) {
      return NextResponse.json({ error: "缺少 imageUrl 或 logoUrl" }, { status: 400 });
    }
    if (typeof body.x !== "number" || typeof body.y !== "number") {
      return NextResponse.json({ error: "x, y 必須是數字" }, { status: 400 });
    }

    const [baseBuf, logoBuf] = await Promise.all([
      bufferFrom(body.imageUrl),
      bufferFrom(body.logoUrl),
    ]);

    const placement: LogoPlacement = {
      x: Math.max(0, Math.min(1, body.x)),
      y: Math.max(0, Math.min(1, body.y)),
      scale: body.scale,
    };
    const shadow: ShadowConfig = body.shadow
      ? { ...DEFAULT_SHADOW, enabled: true }
      : DEFAULT_SHADOW;

    const { buffer } = await renderLogoComposite(baseBuf, logoBuf, placement, shadow);
    const url = await saveBuffer(buffer, "png", "logo-placed-");
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[logo/place]", err);
    return NextResponse.json({ error: (err as Error).message || "合成失敗" }, { status: 500 });
  }
}
