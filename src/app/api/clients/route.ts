import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const clients = await db.client.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { activities: true } } },
  });
  return NextResponse.json(clients);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, primaryColor, secondaryColor, logoUrl, logoUrls, toneLabels, taboos, commonText, pastPostImageUrls } = body;

  if (!name || !primaryColor) {
    return NextResponse.json({ error: "name and primaryColor are required" }, { status: 400 });
  }

  const client = await db.client.create({
    data: {
      name,
      primaryColor,
      secondaryColor: secondaryColor || null,
      logoUrl: logoUrl || null,
      logoUrls: JSON.stringify(logoUrls ?? []),
      toneLabels: JSON.stringify(toneLabels ?? []),
      taboos: JSON.stringify(taboos ?? []),            // [WIP/素材庫] 保留
      commonText: commonText ?? "",                     // [COLLEAGUE] 合併
      pastPostImageUrls: JSON.stringify(pastPostImageUrls ?? []),
    },
  });
  return NextResponse.json({
    ...client,
    toneLabels: JSON.parse(client.toneLabels),
    taboos: JSON.parse(client.taboos),
    pastPostImageUrls: JSON.parse(client.pastPostImageUrls),
    logoUrls: JSON.parse((client.logoUrls as string) ?? "[]"),
  }, { status: 201 });
}
