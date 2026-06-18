import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: { generatedLayouts: { orderBy: { layoutType: "asc" } }, client: true },
  });
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...activity,
    referenceImageUrls: JSON.parse(activity.referenceImageUrls),
    client: {
      ...activity.client,
      toneLabels: JSON.parse(activity.client.toneLabels),
      taboos: JSON.parse(activity.client.taboos),
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  const body = await request.json();

  const updateData: Record<string, unknown> = { ...body };
  if (body.referenceImageUrls) updateData.referenceImageUrls = JSON.stringify(body.referenceImageUrls);

  // If regenerate flag is set, delete old layouts and reset status
  if (body._regenerate) {
    delete updateData._regenerate;
    await db.generatedLayout.deleteMany({ where: { activityId } });
    await db.styleComponent.deleteMany({ where: { sourceLayoutId: { in: (await db.generatedLayout.findMany({ where: { activityId }, select: { id: true } })).map(l => l.id) } } });
    updateData.status = "PENDING";
  }

  const activity = await db.activity.update({
    where: { id: activityId },
    data: updateData,
  });
  return NextResponse.json(activity);
}
