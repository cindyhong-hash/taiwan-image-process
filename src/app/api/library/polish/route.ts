import { NextResponse } from "next/server";
import { polishBriefToChinese, describeReferenceStyle } from "@/lib/generate";
import { describeProduct } from "@/lib/fal";
import { db } from "@/lib/db";

/**
 * POST /api/library/polish
 * body: { brief: string, genType?: string, refImageUrl?: string, clientId?: string, productImageUrl?: string, productImageUrls?: string[] }
 * If refImageUrl is provided, the vision model analyzes its style first and the result
 * is woven into the polish prompt so the expanded description reflects that aesthetic.
 * clientId／productImageUrl(s) 提供品牌調性同實際產品內容，令擴寫唔再係同產品無關嘅通用場景（同活動圖生成一致嘅做法）。
 */
export async function POST(request: Request) {
  try {
    const { brief, genType, refImageUrl, clientId, productImageUrl, productImageUrls } = (await request.json()) ?? {};
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

    let toneLabels: string[] | undefined;
    let taboos: string[] | undefined;
    let primaryColor: string | undefined;
    let secondaryColor: string | undefined;
    if (clientId && typeof clientId === "string") {
      try {
        const client = await db.client.findUnique({ where: { id: clientId } });
        if (client) {
          toneLabels = JSON.parse(client.toneLabels || "[]");
          taboos = JSON.parse(client.taboos || "[]");
          primaryColor = client.primaryColor;
          secondaryColor = client.secondaryColor ?? undefined;
        }
      } catch (e) {
        console.error("[polish] client lookup failed:", e instanceof Error ? e.message : e);
      }
    }

    let productContext: string | undefined;
    const firstProductUrl =
      (Array.isArray(productImageUrls) && productImageUrls.find((u) => typeof u === "string" && u.trim())) ||
      (typeof productImageUrl === "string" && productImageUrl.trim() ? productImageUrl : undefined);
    if (firstProductUrl) {
      try {
        productContext = (await describeProduct(firstProductUrl)) ?? undefined;
      } catch (e) {
        console.error("[polish] product analysis failed:", e instanceof Error ? e.message : e);
      }
    }

    const polished = await polishBriefToChinese({
      brief: String(brief),
      genType,
      styleDesc,
      productContext,
      toneLabels,
      taboos,
      primaryColor,
      secondaryColor,
    });
    return NextResponse.json({ brief: polished });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[library/polish] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
