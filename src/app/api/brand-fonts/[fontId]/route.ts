import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** 刪除品牌字體。只刪 DB 記錄；Blob 上的字檔留著，
 *  因為既有設計稿的圖層可能還引用它，刪檔會讓那些稿子的文字掉回系統字型。 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ fontId: string }> }) {
  const { fontId } = await params;
  const row = await db.styleComponent.findUnique({ where: { id: fontId }, select: { type: true } });
  if (!row || row.type !== "FONT") return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.styleComponent.delete({ where: { id: fontId } });
  return NextResponse.json({ ok: true });
}
