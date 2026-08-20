import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function parseActivity(activity: Record<string, unknown>) {
  return {
    ...activity,
    productImageUrls: JSON.parse((activity.productImageUrls as string) ?? "[]"),
    referenceImageUrls: JSON.parse((activity.referenceImageUrls as string) ?? "[]"),
    selectedComponentIds: JSON.parse((activity.selectedComponentIds as string) ?? "[]"),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: { generatedLayouts: { orderBy: { layoutType: "asc" } }, client: true },
  });
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...parseActivity(activity as unknown as Record<string, unknown>),
    client: {
      ...activity.client,
      toneLabels: JSON.parse(activity.client.toneLabels),
      logoUrls: JSON.parse((activity.client.logoUrls as string) ?? "[]"),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  await db.generatedLayout.deleteMany({ where: { activityId } });
  await db.activity.delete({ where: { id: activityId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  const body = await request.json();

  const updateData: Record<string, unknown> = { ...body };

  // Serialize JSON array fields
  if (body.productImageUrls !== undefined) {
    updateData.productImageUrls = JSON.stringify(body.productImageUrls);
    updateData.productImageUrl = body.productImageUrls[0] ?? ""; // keep compat
  }
  if (body.referenceImageUrls !== undefined)
    updateData.referenceImageUrls = JSON.stringify(body.referenceImageUrls);
  if (body.selectedComponentIds !== undefined)
    updateData.selectedComponentIds = JSON.stringify(body.selectedComponentIds);

  // Regenerate flag: wipe old layouts, reset to PENDING
  if (body._regenerate) {
    delete updateData._regenerate;
    await db.generatedLayout.deleteMany({ where: { activityId } });
    updateData.status = "PENDING";
  }

  const activity = await db.activity.update({
    where: { id: activityId },
    data: updateData,
  });
  return NextResponse.json(parseActivity(activity as unknown as Record<string, unknown>));
}
