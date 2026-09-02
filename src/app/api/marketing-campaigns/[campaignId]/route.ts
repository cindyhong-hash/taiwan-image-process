import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonArray } from "@/lib/marketing-planner";

export async function PATCH(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params, body = await request.json();
  const data: Record<string, unknown> = {};
  for (const key of ["name", "description"] as const) if (body[key] !== undefined) data[key] = String(body[key]);
  if (body.startDate) data.startDate = new Date(body.startDate); if (body.endDate) data.endDate = new Date(body.endDate); if (body.goals !== undefined) data.goals = JSON.stringify(parseJsonArray(body.goals)); if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);
  const campaign = await db.$transaction(async (tx) => {
    await tx.marketingCampaign.update({ where: { id: campaignId }, data });
    if (Array.isArray(body.products)) { await tx.campaignProduct.deleteMany({ where: { campaignId } }); if (body.products.length) await tx.campaignProduct.createMany({ data: body.products.filter((p: { imageUrl?: string }) => p.imageUrl).map((p: { label?: string; imageUrl: string; sourceKind?: string; sourceId?: string }) => ({ campaignId, label: p.label || "產品", imageUrl: p.imageUrl, sourceKind: p.sourceKind || "library", sourceId: p.sourceId || null })) }); }
    if (Array.isArray(body.importantDates)) { await tx.campaignImportantDate.deleteMany({ where: { campaignId } }); if (body.importantDates.length) await tx.campaignImportantDate.createMany({ data: body.importantDates.filter((d: { date?: string; label?: string }) => d.date && d.label).map((d: { date: string; label: string; note?: string }) => ({ campaignId, date: new Date(d.date), label: d.label, note: d.note || "" })) }); }
    return tx.marketingCampaign.findUnique({ where: { id: campaignId }, include: { products: true, importantDates: { orderBy: { date: "asc" } } } });
  });
  return NextResponse.json(campaign ? { ...campaign, goals: parseJsonArray(campaign.goals) } : null);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ campaignId: string }> }) { const { campaignId } = await params; await db.marketingCampaign.delete({ where: { id: campaignId } }); return NextResponse.json({ ok: true }); }
