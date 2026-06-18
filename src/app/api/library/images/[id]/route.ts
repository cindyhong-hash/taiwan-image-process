import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.libraryImage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "刪除失敗" }, { status: 500 });
  }
}

/**
 * PATCH /api/library/images/[id]
 * Update a generated image's recorded style blocks (paramsJson.slots) and/or copyText.
 * A generated image stores its 構圖/配色/語氣/背景 INSIDE paramsJson (a snapshot), not as
 * StyleComponent rows — so editing them must rewrite paramsJson, otherwise the change is lost.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  try {
    const existing = await db.libraryImage.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (body.slots !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: Record<string, any> = {};
      try { parsed = JSON.parse(existing.paramsJson || "{}"); } catch { /* keep {} */ }
      parsed.slots = body.slots;
      data.paramsJson = JSON.stringify(parsed);
    }
    if (body.copyText !== undefined) data.copyText = body.copyText;
    if (body.subject !== undefined) data.subject = body.subject || null; // editable photo title
    if (body.clientId !== undefined) data.clientId = body.clientId; // 專案 re-homing (null = 全部)
    // Bump createdAt so an edited generated image re-sorts to the newest position in the
    // gallery / 圖片紀錄 — matching how edited uploaded components jump to the top.
    if (Object.keys(data).length > 0) data.createdAt = new Date();

    const updated = await db.libraryImage.update({ where: { id }, data });
    return NextResponse.json({ ok: true, id: updated.id });
  } catch {
    return NextResponse.json({ error: "更新失敗" }, { status: 500 });
  }
}
