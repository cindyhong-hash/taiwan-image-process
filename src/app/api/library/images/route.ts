import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Never statically cache — used to poll in-flight generation status.
export const dynamic = "force-dynamic";

/**
 * GET /api/library/images?ids=a,b,c
 * 輕量批量查詢，俾 modal poll 返自己啱啱送出嗰批 LibraryImage 嘅最新狀態
 * （PENDING｜GENERATING｜DONE｜FAILED），唔使成個畫廊都攞返嚟。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return NextResponse.json({ items: [] });

  const rows = await db.libraryImage.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  // 保持返送入嚟嘅 id 順序，方便 client 對得返自己批次嘅順序。
  const items = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  return NextResponse.json({ items });
}
