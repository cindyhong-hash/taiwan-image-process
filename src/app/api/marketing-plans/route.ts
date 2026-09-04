import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monthBounds, parseJsonArray, serializePlan } from "@/lib/marketing-planner";

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  const plans = await db.monthlyMarketingPlan.findMany({ where: { clientId }, include: { _count: { select: { campaigns: true, contentItems: true } } }, orderBy: [{ year: "desc" }, { month: "desc" }] });
  return NextResponse.json(plans.map((p) => serializePlan(p as unknown as Record<string, unknown>)));
}

export async function POST(request: Request) {
  try {
    const body = await request.json(); const now = new Date();
    const clientId = String(body.clientId ?? ""), year = Number(body.year ?? now.getFullYear()), month = Number(body.month ?? now.getMonth() + 1);
    if (!clientId || month < 1 || month > 12) return NextResponse.json({ error: "Invalid client or month" }, { status: 400 });
    const existing = await db.monthlyMarketingPlan.findUnique({ where: { clientId_year_month: { clientId, year, month } } });
    if (existing) return NextResponse.json(serializePlan(existing as unknown as Record<string, unknown>), { status: 200 });
    const plan = await db.monthlyMarketingPlan.create({ data: { clientId, year, month, goals: JSON.stringify(parseJsonArray(body.goals)), platforms: JSON.stringify(parseJsonArray(body.platforms)), totalPostCount: Math.max(1, Math.min(60, Number(body.totalPostCount ?? 12))) } });
    const { start, end } = monthBounds(year, month);
    await db.marketingCampaign.create({ data: { monthlyPlanId: plan.id, name: "本月主打", startDate: start, endDate: end, sortOrder: 0 } });
    return NextResponse.json(serializePlan(plan as unknown as Record<string, unknown>), { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "建立企劃失敗" }, { status: 500 }); }
}
