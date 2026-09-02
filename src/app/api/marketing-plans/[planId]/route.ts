import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonArray, serializePlan } from "@/lib/marketing-planner";

const include = { campaigns: { include: { products: true, importantDates: { orderBy: { date: "asc" as const } } }, orderBy: { sortOrder: "asc" as const } }, contentItems: { orderBy: { sortOrder: "asc" as const } }, client: { select: { id: true, name: true } } };

export async function GET(_request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params; const plan = await db.monthlyMarketingPlan.findUnique({ where: { id: planId }, include });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  return NextResponse.json(serializePlan(plan as unknown as Record<string, unknown>));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params, body = await request.json(); const data: Record<string, unknown> = {};
  if (body.year !== undefined) data.year = Number(body.year); if (body.month !== undefined) data.month = Number(body.month);
  if (body.goals !== undefined) data.goals = JSON.stringify(parseJsonArray(body.goals)); if (body.platforms !== undefined) data.platforms = JSON.stringify(parseJsonArray(body.platforms));
  if (body.totalPostCount !== undefined) data.totalPostCount = Math.max(1, Math.min(60, Number(body.totalPostCount))); if (body.status !== undefined) data.status = String(body.status);
  const plan = await db.monthlyMarketingPlan.update({ where: { id: planId }, data, include }); return NextResponse.json(serializePlan(plan as unknown as Record<string, unknown>));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ planId: string }> }) { const { planId } = await params; await db.monthlyMarketingPlan.delete({ where: { id: planId } }); return NextResponse.json({ ok: true }); }
