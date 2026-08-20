import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function parseClient(client: Record<string, unknown>) {
  return {
    ...client,
    toneLabels: JSON.parse(client.toneLabels as string),
    taboos: JSON.parse(client.taboos as string),
    pastPostImageUrls: JSON.parse((client.pastPostImageUrls as string) ?? "[]"),
    logoUrls: JSON.parse((client.logoUrls as string) ?? "[]"),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: { activities: { orderBy: { createdAt: "desc" } } },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(parseClient(client as unknown as Record<string, unknown>));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const body = await request.json();
  const updateData: Record<string, unknown> = { ...body };
  if (body.toneLabels) updateData.toneLabels = JSON.stringify(body.toneLabels);
  if (body.taboos) updateData.taboos = JSON.stringify(body.taboos);                        // [WIP/素材庫]
  if (body.paletteColors) updateData.paletteColors = JSON.stringify(body.paletteColors);   // [WIP/素材庫] 防呆：array→string
  if (body.pastPostImageUrls) updateData.pastPostImageUrls = JSON.stringify(body.pastPostImageUrls);
  if (body.logoUrls) updateData.logoUrls = JSON.stringify(body.logoUrls);   // 多版本 logo

  const client = await db.client.update({
    where: { id: clientId },
    data: updateData,
  });
  return NextResponse.json(parseClient(client as unknown as Record<string, unknown>));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  await db.client.delete({ where: { id: clientId } });
  return NextResponse.json({ success: true });
}
