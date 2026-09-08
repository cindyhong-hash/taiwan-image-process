/**
 * 素材包 → 建立圖文：依商品 context（名稱/賣點/定位/視覺特徵）產生
 * 一句「本次廣告的建議畫面方向」+ 3–5 個「這次想強調什麼」的快速選項。
 * 只當創作輔助（非阻塞、可修改），不直接決定生成。
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatTextOpenRouter } from "@/lib/openrouter";

export const maxDuration = 30;

function parseJson(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientId = String(body.clientId ?? "");
  const productId = String(body.productId ?? "");
  if (!clientId || !productId) {
    return NextResponse.json({ error: "clientId and productId required" }, { status: 400 });
  }

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { name: true, description: true, category: true, visualProfileJson: true, clientId: true },
  });
  if (!product || product.clientId !== clientId) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { name: true, description: true, industry: true, toneLabels: true },
  });

  // 從 visualProfile 撈 useCases/colors 當額外線索（有就用、沒有不強求）。
  let useCases: string[] = [];
  let colors: string[] = [];
  try {
    const vp = product.visualProfileJson ? JSON.parse(product.visualProfileJson) : null;
    if (Array.isArray(vp?.useCases)) useCases = vp.useCases.filter((v: unknown): v is string => typeof v === "string").slice(0, 6);
    if (Array.isArray(vp?.appearance?.colors)) colors = vp.appearance.colors.filter((v: unknown): v is string => typeof v === "string").slice(0, 4);
  } catch { /* ignore */ }

  const fallbackEmphases = [product.category, ...useCases].filter(Boolean).slice(0, 4) as string[];
  const fallback = {
    direction: `以「${product.name}」為主角，打造貼近品牌調性、乾淨清楚的社群廣告畫面。`,
    emphases: fallbackEmphases.length ? fallbackEmphases : ["產品特色", "使用情境", "品牌調性"],
  };

  const prompt = `你是這個品牌的社群廣告策略師。根據以下商品與品牌資訊，產出「本次廣告的建議畫面方向」與「這次想強調什麼」的快速選項。
品牌：「${client?.name ?? ""}」${client?.industry ? `（${client.industry}）` : ""}${client?.description ? `，簡介：${client.description}` : ""}
商品名稱：${product.name}
商品定位／描述：${product.description ?? "（未提供）"}
商品分類：${product.category ?? "（未提供）"}
${useCases.length ? `使用情境：${useCases.join("、")}` : ""}
${colors.length ? `主要色彩：${colors.join("、")}` : ""}

只回傳 JSON 物件：
{
 "direction": "一句話，描述這次廣告的畫面方向（具體、貼近品牌與商品，避免空泛，最多 60 字）",
 "emphases": ["3-5 個本次可強調的賣點/角度短語，每個 ≤8 字，來自上面的商品資訊，不得杜撰未提供的功效"]
}`;

  try {
    const parsed = parseJson(await chatTextOpenRouter(prompt, 500));
    const direction = typeof parsed?.direction === "string" && parsed.direction.trim() ? parsed.direction.trim() : fallback.direction;
    const emphases = Array.isArray(parsed?.emphases)
      ? (parsed!.emphases as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()).slice(0, 5)
      : fallback.emphases;
    return NextResponse.json({ direction, emphases: emphases.length ? emphases : fallback.emphases });
  } catch {
    return NextResponse.json(fallback);
  }
}
