import { NextResponse } from "next/server";
import { polishBriefToChinese, describeReferenceStyle } from "@/lib/generate";

/**
 * POST /api/library/polish
 * body: { brief: string, genType?: string, refImageUrl?: string }
 * If refImageUrl is provided, the vision model analyzes its style first and the result
 * is woven into the polish prompt so the expanded description reflects that aesthetic.
 */
export async function POST(request: Request) {
  try {
    const { brief, genType, refImageUrl } = (await request.json()) ?? {};
    if (!brief || !brief.trim()) {
      return NextResponse.json({ error: "請先輸入一些設計描述再潤色" }, { status: 400 });
    }
    const host = new URL(request.url).origin;

    let styleDesc: string | undefined;
    if (refImageUrl && typeof refImageUrl === "string" && refImageUrl.trim()) {
      try {
        styleDesc = await describeReferenceStyle(refImageUrl.trim(), host);
      } catch (e) {
        console.error("[polish] reference style analysis failed:", e instanceof Error ? e.message : e);
      }
    }

    const polished = await polishBriefToChinese({ brief: String(brief), genType, styleDesc });
    return NextResponse.json({ brief: polished });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[library/polish] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
