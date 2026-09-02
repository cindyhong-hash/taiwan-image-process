import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monthBounds, parseJsonArray } from "@/lib/marketing-planner";

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params, body = await request.json(); const plan = await db.monthlyMarketingPlan.findUnique({ where: { id: planId }, include: { _count: { select: { campaigns: true } } } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 }); const bounds = monthBounds(plan.year, plan.month);
  const campaign = await db.marketingCampaign.create({ data: { monthlyPlanId: planId, name: String(body.name || "未命名 Campaign"), startDate: body.startDate ? new Date(body.startDate) : bounds.start, endDate: body.endDate ? new Date(body.endDate) : bounds.end, goals: JSON.stringify(parseJsonArray(body.goals)), description: String(body.description ?? ""), sortOrder: plan._count.campaigns } });
  return NextResponse.json({ ...campaign, goals: parseJsonArray(campaign.goals), products: [], importantDates: [] }, { status: 201 });
}
