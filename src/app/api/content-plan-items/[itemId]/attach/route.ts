import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonArray, parseJsonArrayAny } from "@/lib/marketing-planner";

/**
 * 把「既有作品／自由排版設計稿」綁到某篇 topic：
 * 設 generatedActivityId = 指定 Activity，狀態 → 待審核(NEEDS_REVIEW)。
 * 若該作品已綁到別篇，先解除那篇(改回尚未製作)以維持一對一。
 */
export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const { activityId } = await request.json().catch(() => ({}));
  if (!activityId) return NextResponse.json({ error: "activityId required" }, { status: 400 });

  const item = await db.contentPlanItem.findUnique({ where: { id: itemId }, include: { monthlyPlan: { select: { clientId: true } } } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const activity = await db.activity.findUnique({ where: { id: String(activityId) }, select: { id: true, clientId: true } });
  if (!activity || activity.clientId !== item.monthlyPlan.clientId) {
    return NextResponse.json({ error: "作品不存在或不屬於此品牌" }, { status: 400 });
  }

  // 一對一：若此作品已綁別篇，先把那篇解除
  const currentOwner = await db.contentPlanItem.findUnique({ where: { generatedActivityId: activity.id }, select: { id: true } });
  try {
    await db.$transaction([
      ...(currentOwner && currentOwner.id !== itemId
        ? [db.contentPlanItem.update({ where: { id: currentOwner.id }, data: { generatedActivityId: null, status: "PLANNING" } })]
        : []),
      db.contentPlanItem.update({ where: { id: itemId }, data: { generatedActivityId: activity.id, status: "NEEDS_REVIEW" } }),
      db.monthlyMarketingPlan.update({ where: { id: item.monthlyPlanId }, data: { status: "REVIEW" } }),
    ]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "綁定失敗" }, { status: 500 });
  }

  const updated = await db.contentPlanItem.findUnique({ where: { id: itemId } });
  return NextResponse.json(updated ? { ...updated, platforms: parseJsonArray(updated.platforms), sourceSignals: parseJsonArrayAny(updated.sourceSignals) } : null);
}
