import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatTextOpenRouter } from "@/lib/openrouter";
import { normalizeStrategy, parseJsonArray, parseJsonObject } from "@/lib/marketing-planner";
import { analyzePlannerProducts } from "@/lib/planner/analyze-products";
import { buildPlannerContext, groundStrategyWithoutProducts, hasUsableCampaignProducts } from "@/lib/planner/planner-context";

function extractJson(text: string | null) {
  if (!text) return null;
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { return null; }
}

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const body = await request.json().catch(() => ({}));
  const plan = await db.monthlyMarketingPlan.findUnique({
    where: { id: planId },
    include: {
      client: { select: { name: true, description: true, industry: true, toneLabels: true } },
      campaigns: { include: { products: true, importantDates: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  const goals = parseJsonArray(plan.goals);
  const campaigns = plan.campaigns.map((c) => ({ id: c.id, name: c.name, goals: parseJsonArray(c.goals), description: c.description, products: c.products.map((p) => p.label), importantDates: c.importantDates.map((d) => ({ date: d.date, label: d.label })) }));
  const productAnalyses = await analyzePlannerProducts(plan.campaigns);
  const plannerContext = buildPlannerContext(plan, productAnalyses);
  let proposed = body.strategy;
  if (!proposed) {
    const prompt = `你是台灣社群行銷策略師。請為 ${plan.year}/${plan.month} 月度企劃分配內容。\n本次可依據的品牌與產品事實：${JSON.stringify(plannerContext)}\n目標：${goals.join("、")}\n總篇數：${plan.totalPostCount}\n請嚴格遵守 groundingRules。只回傳 JSON，格式：{"summary":"繁中策略摘要","contentMix":[{"type":"BRAND|EDUCATION|PRODUCT|ENGAGEMENT|PROMOTION","count":整數,"reason":"短句"}],"campaignAllocations":[{"campaignId":"原 ID","count":整數,"contentMix":{}}]}。兩組 count 都必須各自合計 ${plan.totalPostCount}。`;
    proposed = extractJson(await chatTextOpenRouter(prompt, 1400));
  }
  const strategy = groundStrategyWithoutProducts(
    normalizeStrategy(proposed, plan.totalPostCount, goals, campaigns),
    hasUsableCampaignProducts(plan.campaigns),
  );
  await db.monthlyMarketingPlan.update({ where: { id: planId }, data: { strategyJson: JSON.stringify(strategy), status: "STRATEGY_READY" } });
  return NextResponse.json({ strategy });
}

export async function GET(_request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const plan = await db.monthlyMarketingPlan.findUnique({ where: { id: planId }, select: { strategyJson: true } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  return NextResponse.json({ strategy: parseJsonObject(plan.strategyJson, {}) });
}
