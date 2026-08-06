import { NextResponse } from "next/server";
import { compositeCollage } from "@/lib/composite-multi";
import { overlayLogo } from "@/lib/composite";
import { getCellRects } from "@/types/multiLayout";

export const maxDuration = 60;

const SIZE: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 }, "4:5": { w: 820, h: 1024 },
  "3:4": { w: 768, h: 1024 }, "2:3": { w: 683, h: 1024 },
  "9:16": { w: 576, h: 1024 }, "4:3": { w: 1024, h: 768 },
  "3:2": { w: 1024, h: 683 }, "16:9": { w: 1024, h: 576 },
};

/** 重新拼版：給各格圖 URL + 版型 → 合成一張拼版大圖（可選疊 logo）*/
export async function POST(request: Request) {
  try {
    const { cellUrls, layoutId, ratio, logoUrl, logoMode } = await request.json();
    if (!Array.isArray(cellUrls) || cellUrls.length === 0 || !layoutId) {
      return NextResponse.json({ error: "cellUrls and layoutId required" }, { status: 400 });
    }
    const size = SIZE[ratio as string] ?? { w: 1024, h: 1024 };
    const rects = getCellRects(layoutId, cellUrls.length);

    let composite = await compositeCollage({
      cellUrls, rects, canvasWidth: size.w, canvasHeight: size.h,
    });

    if (logoMode && logoMode !== "none" && logoUrl) {
      try {
        composite = await overlayLogo({ imageUrl: composite, logoUrl, textZone: "none" });
      } catch (e) { console.warn("[composite] logo overlay failed:", e); }
    }

    return NextResponse.json({ imageUrl: composite });
  } catch (err) {
    console.error("[POST /api/composite]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
