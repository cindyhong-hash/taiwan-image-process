/**
 * 靈感中心 — 一個 Topic 展開多種切角（第九節）。
 * POST { clientId, topic } → { angles: [{ type, title, copyDirection }] }
 * 讓使用者點「看看 AI 怎麼切入」後，直接選一個角度「用這個做貼文」，不必先進完整 Brief。
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatTextOpenRouter } from "@/lib/openrouter";
import type { ContentAngle } from "@/lib/inspiration/types";

export const maxDuration = 45;

function extractArray(text: string | null): Record<string, unknown>[] {
  if (!text) return [];
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const match = cleaned.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientId = String(body.clientId ?? "");
  const topic = String(body.topic ?? "").trim();
  if (!clientId || !topic) return NextResponse.json({ error: "clientId and topic required" }, { status: 400 });

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { name: true, description: true, industry: true, toneLabels: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const tone = (() => {
    try {
      const t = JSON.parse(client.toneLabels || "[]");
      return Array.isArray(t) ? t.join("、") : "";
    } catch {
      return "";
    }
  })();

  const prompt = `你是台灣品牌社群企劃。品牌：「${client.name}」${client.industry ? `（${client.industry}）` : ""}${tone ? `，語氣：${tone}` : ""}。
針對主題「${topic}」，給 4–5 個不同角度的貼文切入方式，涵蓋：知識型、產品型、Lifestyle、互動型、促銷型（有哪些用哪些）。
標題要口語、平台原生、一看想點（最多 1 個 emoji）。不得杜撰未提供的產品或功能。
只回傳 JSON array，每項：{"type":"知識型|產品型|Lifestyle|互動型|促銷型","title":"貼文標題","copyDirection":"這篇最想讓受眾記住的一句話"}。`;

  const raw = extractArray(await chatTextOpenRouter(prompt, 1200));
  const angles: ContentAngle[] = raw
    .filter((a) => a && a.title)
    .slice(0, 5)
    .map((a) => ({
      type: String(a.type ?? "角度"),
      title: String(a.title),
      copyDirection: a.copyDirection ? String(a.copyDirection) : undefined,
    }));

  return NextResponse.json({ angles });
}
