import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // 反向同步：若呢張係由活動成品匯入嘅參考圖（paramsJson.fromLayoutId），
    // 刪走時把對應活動 layout 標返「未加入素材庫」，唔好令活動頁仲顯示已加入。
    const img = await db.libraryImage.findUnique({ where: { id } });
    if (img) {
      try {
        const p = JSON.parse(img.paramsJson || "{}");
        if (p.fromLayoutId) {
          await db.generatedLayout.update({ where: { id: p.fromLayoutId }, data: { savedToLibrary: false } }).catch(() => {});
        }
      } catch { /* ignore */ }
    }
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

    // 「調整」：擁有權規則決定每個 block 係就地改定 fork。
    if (body.blockEdits !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: Record<string, any> = {};
      try { parsed = JSON.parse(existing.paramsJson || "{}"); } catch { /* keep {} */ }
      const myImageUrl = existing.imageUrl;
      const editClientId = body.clientId !== undefined ? body.clientId : existing.clientId;

      // block 係咪「借用」（唔屬於呢張圖）？→ 有其他圖引用、或係第二個素材（previewUrl）分析出嚟嘅家 block。
      const allImages = await db.libraryImage.findMany({ select: { id: true, paramsJson: true } });
      const isShared = (blockId: string, previewUrl: string | null): boolean => {
        if (previewUrl && previewUrl !== myImageUrl) return true; // 係第二個素材嘅家 block
        for (const im of allImages) {
          if (im.id === id) continue;
          try {
            const pj = JSON.parse(im.paramsJson || "{}");
            for (const s of Object.values(pj.slots ?? {})) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if (s && (s as any).id === blockId) return true;
            }
          } catch { /* ignore */ }
        }
        return false;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snap = (row: any, type: string) => ({
        id: row.id, type, name: row.name,
        data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
        aiPromptText: row.aiPromptText, clientId: row.clientId,
        sourceLayoutId: row.sourceLayoutId ?? "", previewUrl: row.previewUrl ?? null,
        createdAt: row.createdAt,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolveSlot = async (edit: any) => {
        if (!edit) return null; // unchecked → 移除
        const { type, name, data: sdata, aiPromptText, prevBlockId, changed } = edit;
        const realId = prevBlockId && !String(prevBlockId).startsWith("edited-")
          && !String(prevBlockId).startsWith("imp-") && !String(prevBlockId).startsWith("preset-");
        const prev = realId ? await db.styleComponent.findUnique({ where: { id: prevBlockId } }) : null;

        // 冇改動 + 原 block 仲喺 → 原封不動指返佢。
        if (!changed && prev) return snap(prev, type);

        // 借用（或原 block 已冇）→ fork 一個屬於自己嘅新 block；自己專屬 → 就地改。
        // previewUrl = 擁有嗰張圖 → picker card 會顯示返該產品/參考圖（唔止色塊）。
        if (prev && !isShared(prevBlockId, prev.previewUrl)) {
          const upd = await db.styleComponent.update({
            where: { id: prevBlockId },
            data: { name, data: JSON.stringify(sdata ?? {}), aiPromptText: aiPromptText ?? "", clientId: editClientId ?? null, previewUrl: myImageUrl, createdAt: new Date() },
          });
          return snap(upd, type);
        }
        const created = await db.styleComponent.create({
          data: { name, type, data: JSON.stringify(sdata ?? {}), aiPromptText: aiPromptText ?? "", clientId: editClientId ?? null, sourceLayoutId: "manual", previewUrl: myImageUrl },
        });
        return snap(created, type);
      };

      const be = body.blockEdits;
      const [layout, color, tone] = await Promise.all([resolveSlot(be.layout), resolveSlot(be.color), resolveSlot(be.tone)]);
      parsed.slots = { layout, color, tone, background: body.background ?? (parsed.slots?.background ?? null) };
      data.paramsJson = JSON.stringify(parsed);
    } else if (body.slots !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: Record<string, any> = {};
      try { parsed = JSON.parse(existing.paramsJson || "{}"); } catch { /* keep {} */ }
      parsed.slots = body.slots;
      data.paramsJson = JSON.stringify(parsed);
    }
    if (body.copyText !== undefined) data.copyText = body.copyText;
    if (body.subject !== undefined) data.subject = body.subject || null; // editable photo title
    if (body.clientId !== undefined) data.clientId = body.clientId; // 專案 re-homing (null = 全部)
    // 「調整風格積木」＝改 metadata，唔算重新生成 → 唔好 bump createdAt（唔好令舊圖跳去 gallery 最新）。
    // 只有真正改到圖內容（文案 / 標題）先 re-sort。
    const blockOnlyEdit = (body.blockEdits !== undefined || body.slots !== undefined)
      && body.copyText === undefined && body.subject === undefined;
    if (Object.keys(data).length > 0 && !blockOnlyEdit) data.createdAt = new Date();

    const updated = await db.libraryImage.update({ where: { id }, data });
    return NextResponse.json({ ok: true, id: updated.id });
  } catch {
    return NextResponse.json({ error: "更新失敗" }, { status: 500 });
  }
}
