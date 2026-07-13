import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const assets = await db.generatedLayout.findMany({
      where: {
        savedToLibrary: true,
        ...(clientId ? { activity: { clientId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        activity: {
          select: { theme: true, clientId: true, client: { select: { name: true } } },
        },
      },
      take: 100,
    });

    return NextResponse.json(assets);
  } catch (err) {
    console.error("[GET /api/assets]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
