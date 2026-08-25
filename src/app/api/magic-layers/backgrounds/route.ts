/* ============================================================
   GET /api/magic-layers/backgrounds?clientId=...
   Lists previously-generated library images to use as swappable backgrounds in
   the editor. Prefers background-category assets; falls back to all recent
   images. Returns [] gracefully if the DB is unavailable (e.g. local dev).
   ============================================================ */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  try {
    const rows = await db.libraryImage.findMany({
      where: { status: "DONE", ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 80,
    });
    const isBg = (r: { paramsJson: string; subject: string | null; prompt: string }) => {
      try { const p = JSON.parse(r.paramsJson || "{}"); if (/background|背景|scene|場景/i.test(String(p.kind ?? "") + String(p.category ?? "") + String(p.mode ?? ""))) return true; } catch { /* ignore */ }
      return /背景|場景|background/i.test((r.subject ?? "") + " " + (r.prompt ?? ""));
    };
    const bgs = rows.filter(isBg);
    const list = (bgs.length ? bgs : rows)
      .filter((r) => r.imageUrl)
      .map((r) => ({ url: r.imageUrl, label: r.subject || r.prompt?.slice(0, 18) || "" }));
    return NextResponse.json({ backgrounds: list });
  } catch {
    return NextResponse.json({ backgrounds: [] });
  }
}
