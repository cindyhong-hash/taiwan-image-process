import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  const assets = await db.generatedLayout.findMany({
    where: clientId ? { activity: { clientId } } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      activity: {
        select: { theme: true, clientId: true, client: { select: { name: true } } },
      },
    },
    take: 100,
  });

  return NextResponse.json(assets);
}
