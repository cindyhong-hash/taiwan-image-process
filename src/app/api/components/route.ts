import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Never statically cache this handler — component data changes on every edit/save/delete.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const previewUrl = searchParams.get("previewUrl");
  const unassigned = searchParams.get("unassigned") === "1"; // 未分組：clientId 為 null
  const ids = searchParams.get("ids"); // 逗號分隔嘅 component id 清單 —— 用嚟由已存嘅 selectedComponentIds 準確攞返嗰幾件（例如活動編輯頁重新掛返 03 積木），跳過下面嘅 client/previewUrl 篩選同去重（呢個係精確 id 對應，唔應該被去重邏輯漏走）。

  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    const components = await db.styleComponent.findMany({ where: { id: { in: idList } } });
    return NextResponse.json(components.map((c) => ({ ...c, data: JSON.parse(c.data) })));
  }

  const where: { clientId?: string | null; previewUrl?: string } = {};
  if (clientId) where.clientId = clientId;
  else if (unassigned) where.clientId = null;
  if (previewUrl) where.previewUrl = previewUrl;

  const components = await db.styleComponent.findMany({
    where: Object.keys(where).length ? where : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // 每次活動圖生成都會自動存低一份 構圖/配色/語氣（sourceLayoutId 綁實），但同一品牌嘅
  // 配色通常唔會變（跟 client.primaryColor），生成得多次就會有大量內容完全一樣嘅重複卡，
  // 洗版揀色 picker。冇 previewUrl（即自動生成，唔係用戶自己上傳分析嘅素材）先去重，
  // 淨係喺呢個列表 API 隱藏，唔刪 DB（撤回活動圖時仍要對返正確嗰筆）。
  const seen = new Set<string>();
  const deduped = components.filter((c) => {
    if (c.previewUrl) return true;
    const key = `${c.clientId}|${c.type}|${c.data}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json(
    deduped.map((c) => ({ ...c, data: JSON.parse(c.data) }))
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, type, clientId, data, aiPromptText, previewUrl } = body;

  if (!name || !type) {
    return NextResponse.json({ error: "name and type are required" }, { status: 400 });
  }

  // Upsert: if a component of this type already exists for the same image
  // (previewUrl), update it in place + bump to top instead of creating a duplicate.
  // Match on previewUrl+type only (NOT clientId) so that changing 專案 in the editor
  // MOVES the existing component to the new client instead of forking a duplicate.
  if (previewUrl) {
    const existing = await db.styleComponent.findFirst({
      where: { previewUrl, type },
    });
    if (existing) {
      const updated = await db.styleComponent.update({
        where: { id: existing.id },
        data: {
          name,
          clientId: clientId ?? null, // allow re-homing to a different 專案 (or 全部/null)
          data: JSON.stringify(data ?? {}),
          aiPromptText: aiPromptText ?? "",
          createdAt: new Date(), // bump to top
        },
      });
      return NextResponse.json({ ...updated, data: JSON.parse(updated.data) });
    }
  }

  const component = await db.styleComponent.create({
    data: {
      name,
      type,
      clientId: clientId ?? null,
      data: JSON.stringify(data ?? {}),
      aiPromptText: aiPromptText ?? "",
      previewUrl: previewUrl ?? null,
      sourceLayoutId: "manual",
    },
  });

  return NextResponse.json({ ...component, data: JSON.parse(component.data) });
}
