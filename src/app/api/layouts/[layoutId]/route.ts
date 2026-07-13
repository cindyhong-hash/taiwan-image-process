import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ layoutId: string }> }
) {
  const { layoutId } = await params;
  const body = await request.json();

  const layout = await db.generatedLayout.update({
    where: { id: layoutId },
    data: {
      ...(body.imageUrl  !== undefined && { imageUrl:  body.imageUrl }),
      ...(body.copyText  !== undefined && { copyText:  body.copyText }),
      ...(body.isSelected !== undefined && { isSelected: body.isSelected }),
      ...(body.savedToLibrary !== undefined && { savedToLibrary: body.savedToLibrary }),
    },
  });

  // 「加入素材庫」＝活動成品入素材庫嘅「參考圖」（wireframe ⑦）。
  // 建一筆 rich LibraryImage：帶 ① 生成 Prompt ② 來源產品圖 ③ AI 據實分析成品圖嘅 構圖/配色 slots。
  // 咁 detail 一次過有：Prompt + 來源圖 + 構圖/配色 + 帶入生成（同活動成圖 detail 一致），title 亦可改。
  const origin = new URL(request.url).origin;
  const IMPORT_SRC = `import-${layoutId}`; // 舊做法殘留標記，撤回時順手清

  if (body.savedToLibrary === true) {
    const exists = await db.libraryImage.findFirst({ where: { imageUrl: layout.imageUrl } });
    if (!exists) {
      const act = await db.activity.findUnique({
        where: { id: layout.activityId },
        select: { clientId: true, theme: true, focusPoint: true, imagePrompt: true, productImageUrls: true, productImageUrl: true },
      });
      // 來源產品圖
      let sources: string[] = [];
      try { const a = JSON.parse(act?.productImageUrls ?? "[]"); if (Array.isArray(a)) sources = a.filter(Boolean); } catch { /* ignore */ }
      if (!sources.length && act?.productImageUrl) sources = [act.productImageUrl];
      // AI 據實分析成品圖 → 構圖/配色 slots（失敗就只係冇 slots，唔影響其餘）。
      // 呢兩個真係寫入 StyleComponent（唔再淨係塞喺 paramsJson 嘅虛擬 id），
      // 咁樣先會喺「選擇配色/構圖積木」picker 度見到、之後其他圖都揀得返呢個真實成品配色。
      const slots: Record<string, unknown> = {};
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
      try {
        const aRes = await fetch(`${origin}/api/components/analyze`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: layout.imageUrl }),
        });
        const a = await aRes.json();
        if (aRes.ok && !a.error) {
          if (a.composition) {
            const compData = { description: a.composition.description ?? "" };
            const saved = await db.styleComponent.create({
              data: {
                name: a.composition.name || `構圖-參考圖-${today}`, type: "COMPOSITION",
                data: JSON.stringify(compData), aiPromptText: a.composition.aiPromptText ?? "",
                sourceLayoutId: layoutId, clientId: act?.clientId ?? null,
                previewUrl: layout.imageUrl, // 令 picker card 顯示返呢張參考圖
              },
            });
            slots.layout = { id: saved.id, type: "COMPOSITION", name: saved.name, data: compData, aiPromptText: saved.aiPromptText };
          }
          if (a.colorScheme) {
            const cs = a.colorScheme;
            const colors = [
              cs.primaryColor ? { hex: cs.primaryColor, role: "primary", label: "主色" } : null,
              cs.secondaryColor ? { hex: cs.secondaryColor, role: "secondary", label: "輔色" } : null,
              ...(Array.isArray(cs.extraColors) ? cs.extraColors.map((h: string, i: number) => ({ hex: h, role: i === 0 ? "accent" : "neutral", label: i === 0 ? "強調色" : "中性色" })) : []),
            ].filter(Boolean);
            const colorData = { colors, primaryColor: cs.primaryColor, secondaryColor: cs.secondaryColor };
            const saved = await db.styleComponent.create({
              data: {
                name: cs.name || `配色-參考圖-${today}`, type: "COLOR_SCHEME",
                data: JSON.stringify(colorData), aiPromptText: cs.aiPromptText ?? "",
                sourceLayoutId: layoutId, clientId: act?.clientId ?? null,
                previewUrl: layout.imageUrl, // 令 picker card 顯示返呢張參考圖
              },
            });
            slots.color = { id: saved.id, type: "COLOR_SCHEME", name: saved.name, data: colorData, aiPromptText: saved.aiPromptText };
          }
        }
      } catch { /* analyze 失敗：照建，只係冇 slots */ }

      const promptText = act?.imagePrompt || [act?.theme, act?.focusPoint].filter(Boolean).join(" · ") || "";
      await db.libraryImage.create({
        data: {
          clientId: act?.clientId ?? null,
          imageUrl: layout.imageUrl,
          subject: act?.theme ?? null,
          prompt: promptText,
          copyText: layout.copyText ?? null,
          paramsJson: JSON.stringify({ genType: "reference", fromLayoutId: layoutId, productImageUrls: sources, slots }),
        },
      });
    }
  } else if (body.savedToLibrary === false) {
    // 撤回：刪 LibraryImage + 清舊做法殘留
    await db.libraryImage.deleteMany({ where: { imageUrl: layout.imageUrl } });
    await db.styleComponent.deleteMany({ where: { sourceLayoutId: IMPORT_SRC } });
    await db.styleComponent.updateMany({
      where: { sourceLayoutId: layoutId, type: { in: ["COMPOSITION", "COLOR_SCHEME"] } },
      data: { previewUrl: null },
    });
  }

  return NextResponse.json(layout);
}
