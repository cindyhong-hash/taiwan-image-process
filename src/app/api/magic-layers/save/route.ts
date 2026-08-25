/* ============================================================
   Magic Layers — save / load an editable 排版 as an Activity draft
   進行中的自由排版 = 一筆 Activity(status DRAFT, layoutId="magic-layers") + 一筆
   GeneratedLayout（imageUrl=壓平縮圖、textLayerJson=排版 JSON）。這樣它就出現在
   「廣告活動圖」列表的草稿裡，點擊可回編輯器續編。零 DB migration（重用現成欄位）。

   POST body { clientId, activityId?, name, docW, docH, layers, imageDataUrl, finalize? }
        → { activityId }   (create when no activityId, else update)
        finalize=true（按下載時）：活動轉 DONE，並把成品推一次到素材庫。
   GET  ?activity=<activityId>  (或舊的 ?id=<libraryImageId>)
        → { activityId?, name, docW, docH, layers, imageUrl }
   ============================================================ */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveBuffer } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MARKER = "magicLayout";
const LAYOUT_ID = "magic-layers";

export async function POST(request: Request) {
  try {
    const { clientId, activityId, name, docW, docH, layers, imageDataUrl, finalize } = await request.json();
    if (!Array.isArray(layers) || !docW || !docH) return NextResponse.json({ error: "missing docW/docH/layers" }, { status: 400 });

    let imageUrl = "";
    if (typeof imageDataUrl === "string" && imageDataUrl.startsWith("data:")) {
      imageUrl = await saveBuffer(Buffer.from(imageDataUrl.split(",")[1] ?? "", "base64"), "png", "ml-layout-");
    }
    const textLayerJson = JSON.stringify({ kind: MARKER, version: 1, docW, docH, layers });
    const theme = (typeof name === "string" && name.trim()) ? name.trim().slice(0, 80) : "未命名排版";
    const status = finalize ? "DONE" : "DRAFT";

    // find or create the Activity
    let id = activityId as string | undefined;
    if (id) {
      await db.activity.update({ where: { id }, data: { theme, status } });
    } else {
      if (!clientId) return NextResponse.json({ error: "missing clientId" }, { status: 400 });
      const act = await db.activity.create({
        data: { clientId, theme, focusPoint: "", layoutId: LAYOUT_ID, status, imageRatio: `${docW}:${docH}` },
      });
      id = act.id;
    }

    // upsert its single GeneratedLayout (holds the thumbnail + the editable layout doc)
    const existing = await db.generatedLayout.findFirst({ where: { activityId: id } });
    if (existing) {
      await db.generatedLayout.update({
        where: { id: existing.id },
        data: { textLayerJson, ...(imageUrl ? { imageUrl } : {}) },
      });
    } else {
      await db.generatedLayout.create({
        data: { activityId: id!, layoutType: LAYOUT_ID, imageUrl, copyText: "", textLayerJson, isSelected: true },
      });
    }

    // 下載時把成品推一次到素材庫（用 savedToLibrary 當去重旗標，避免重複下載狂加）
    if (finalize && imageUrl) {
      const gl = await db.generatedLayout.findFirst({ where: { activityId: id } });
      if (gl && !gl.savedToLibrary) {
        await db.libraryImage.create({ data: { clientId: clientId ?? null, imageUrl, subject: theme, prompt: "", paramsJson: JSON.stringify({ kind: MARKER, activityId: id }), status: "DONE" } });
        await db.generatedLayout.update({ where: { id: gl.id }, data: { savedToLibrary: true } });
      }
    }

    return NextResponse.json({ activityId: id });
  } catch (err) {
    console.error("[magic-layers/save] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;
    const activityId = sp.get("activity");
    const libId = sp.get("id");

    let textLayerJson = "{}"; let name = ""; let imageUrl = ""; let outActivityId: string | undefined;
    if (activityId) {
      const gl = await db.generatedLayout.findFirst({ where: { activityId }, orderBy: { createdAt: "desc" } });
      const act = await db.activity.findUnique({ where: { id: activityId } });
      if (!gl || !act) return NextResponse.json({ error: "not found" }, { status: 404 });
      textLayerJson = gl.textLayerJson; name = act.theme; imageUrl = gl.imageUrl; outActivityId = activityId;
    } else if (libId) {
      const row = await db.libraryImage.findUnique({ where: { id: libId } });
      if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
      // 舊素材庫排版：paramsJson 可能直接存 doc，或指向 activityId
      let p: { kind?: string; activityId?: string; docW?: number; docH?: number; layers?: unknown[] } = {};
      try { p = JSON.parse(row.paramsJson || "{}"); } catch { /* ignore */ }
      if (p.activityId) return GET(new Request(request.url.replace(/id=[^&]*/, `activity=${p.activityId}`)));
      textLayerJson = row.paramsJson; name = row.subject ?? ""; imageUrl = row.imageUrl;
    } else {
      return NextResponse.json({ error: "missing activity/id" }, { status: 400 });
    }

    let doc: { kind?: string; docW?: number; docH?: number; layers?: unknown[] } = {};
    try { doc = JSON.parse(textLayerJson || "{}"); } catch { /* ignore */ }
    if (doc.kind !== MARKER) return NextResponse.json({ error: "not a magic layout" }, { status: 400 });
    return NextResponse.json({ activityId: outActivityId, name, imageUrl, docW: doc.docW, docH: doc.docH, layers: doc.layers ?? [] });
  } catch (err) {
    console.error("[magic-layers/load] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
