import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** POST /api/library/save-image — persist a draft image (from draftOnly generation) to LibraryImage. */
export async function POST(request: Request) {
  try {
    const { clientId, imageUrl, subject, prompt, copyText, paramsJson } = await request.json();
    if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });

    // 自我修復保證：確保每個 slot 引用嘅 block 都真係存在（有真實 StyleComponent 行），
    // 否則個 block 唔會喺「選擇積木 picker」出現（= 舊圖用過但揀唔返）。若 client 傳嚟嘅 slot id
    // 查唔到真實行（例如之前持久化失敗留低嘅孤兒 snapshot），就即場由 snapshot 重建一個真實行。
    let paramsStr = paramsJson ?? "{}";
    try {
      const parsed = JSON.parse(paramsStr);
      const slots = parsed?.slots;
      if (slots && typeof slots === "object") {
        for (const key of Object.keys(slots)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const s: any = slots[key];
          if (!s || !s.id || typeof s.id !== "string") continue;
          if (s.id.startsWith("edited-") || s.id.startsWith("imp-") || s.id.startsWith("preset-")) continue;
          const exists = await db.styleComponent.findUnique({ where: { id: s.id } });
          if (!exists) {
            const created = await db.styleComponent.create({
              data: {
                name: s.name ?? "素材", type: s.type ?? key,
                data: JSON.stringify(s.data ?? {}), aiPromptText: s.aiPromptText ?? "",
                clientId: clientId ?? null, sourceLayoutId: "manual", previewUrl: imageUrl,
              },
            });
            s.id = created.id; s.previewUrl = imageUrl; // 指向新真實行 + 帶圖俾 picker 顯示
          }
        }
        paramsStr = JSON.stringify(parsed);
      }
    } catch { /* paramsJson 唔係合法 JSON → 原樣存 */ }

    const row = await db.libraryImage.create({
      data: {
        clientId: clientId ?? null,
        imageUrl,
        subject: subject ?? null,
        prompt: prompt ?? "",
        copyText: copyText ?? null,
        paramsJson: paramsStr,
      },
    });
    return NextResponse.json({ id: row.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
