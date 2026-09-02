import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CONTENT_TYPES, parseJsonArray , parseJsonArrayAny} from "@/lib/marketing-planner";

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params; const body = await request.json(); const data: Record<string, unknown> = {};
  if (body.campaignId !== undefined) data.campaignId = body.campaignId || null;
  if (body.contentType !== undefined && CONTENT_TYPES.includes(body.contentType)) data.contentType = body.contentType;
  for (const key of ["topic", "contentDirection", "recommendationReason", "status"] as const) if (body[key] !== undefined) data[key] = String(body[key]);
  if (body.format !== undefined) data.format = body.format === "CAROUSEL" ? "CAROUSEL" : "SINGLE";
  if (body.platforms !== undefined) data.platforms = JSON.stringify(parseJsonArray(body.platforms));
  if (body.scheduledDate !== undefined) data.scheduledDate = body.scheduledDate ? new Date(`${String(body.scheduledDate).slice(0, 10)}T12:00:00.000Z`) : null;
  const item = await db.contentPlanItem.update({ where: { id: itemId }, data });
  if (body.status === "APPROVED" || body.status === "NEEDS_REVIEW") {
    const [total, approved] = await Promise.all([
      db.contentPlanItem.count({ where: { monthlyPlanId: item.monthlyPlanId } }),
      db.contentPlanItem.count({ where: { monthlyPlanId: item.monthlyPlanId, status: "APPROVED" } }),
    ]);
    await db.monthlyMarketingPlan.update({ where: { id: item.monthlyPlanId }, data: { status: total > 0 && approved === total ? "COMPLETED" : "REVIEW" } });
  }
  return NextResponse.json({ ...item, platforms: parseJsonArray(item.platforms), sourceSignals: parseJsonArrayAny(item.sourceSignals) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ itemId: string }> }) { const { itemId } = await params; await db.contentPlanItem.delete({ where: { id: itemId } }); return NextResponse.json({ ok: true }); }
