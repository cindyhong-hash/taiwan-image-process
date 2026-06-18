import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json();
  const { clientId, theme, focusPoint, productImageUrl, referenceImageUrls } = body;

  if (!clientId || !theme || !focusPoint || !productImageUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const activity = await db.activity.create({
    data: {
      clientId,
      theme,
      focusPoint,
      productImageUrl,
      referenceImageUrls: JSON.stringify(referenceImageUrls ?? []),
      status: "PENDING",
    },
  });
  return NextResponse.json(activity, { status: 201 });
}
