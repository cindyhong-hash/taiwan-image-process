import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatTextOpenRouter } from "@/lib/openrouter";
import { parseJsonArray , parseJsonArrayAny} from "@/lib/marketing-planner";

function parse(text: string | null) { if (!text) return null; try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { return null; } }

export async function POST(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const item = await db.contentPlanItem.findUnique({ where: { id: itemId }, include: { campaign: true, monthlyPlan: { include: { client: { select: { name: true } } } } } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  const prompt = `替 ${item.monthlyPlan.client.name} 的 Campaign「${item.campaign?.name ?? "本月企劃"}」重新產生一個 ${item.contentType} 社群主題，不可與「${item.topic}」相同。只回 JSON：{"topic":"繁中標題","contentDirection":"一句具體方向","format":"SINGLE|CAROUSEL","recommendationReason":"一句推薦理由"}`;
  const generated = parse(await chatTextOpenRouter(prompt, 500)) ?? { topic: `${item.campaign?.name ?? "本月企劃"}｜換個角度看：${item.topic.replace(/^.*｜/, "")}`, contentDirection: "以新的情境與切角重新溝通，內容保持清楚且可執行。", format: item.format, recommendationReason: item.recommendationReason };
  const updated = await db.contentPlanItem.update({ where: { id: itemId }, data: { topic: String(generated.topic || item.topic), contentDirection: String(generated.contentDirection || item.contentDirection), recommendationReason: String(generated.recommendationReason || item.recommendationReason || ""), format: generated.format === "CAROUSEL" ? "CAROUSEL" : "SINGLE" } });
  return NextResponse.json({ ...updated, platforms: parseJsonArray(updated.platforms), sourceSignals: parseJsonArrayAny(updated.sourceSignals) });
}
