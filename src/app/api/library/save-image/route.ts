import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** POST /api/library/save-image — persist a draft image (from draftOnly generation) to LibraryImage. */
export async function POST(request: Request) {
  try {
    const { clientId, imageUrl, subject, prompt, copyText, paramsJson } = await request.json();
    if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    const row = await db.libraryImage.create({
      data: {
        clientId: clientId ?? null,
        imageUrl,
        subject: subject ?? null,
        prompt: prompt ?? "",
        copyText: copyText ?? null,
        paramsJson: paramsJson ?? "{}",
      },
    });
    return NextResponse.json({ id: row.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
