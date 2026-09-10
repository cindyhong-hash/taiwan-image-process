/**
 * 品牌字體（上傳／列出）。
 *
 * 存在 StyleComponent（type="FONT"、previewUrl=null）而不是 Client 的新欄位：
 * 這樣不用改 schema、正式站也不用手動跑 Turso migration。
 * 素材庫的 gallery 有 `previewUrl: { not: null }` 過濾，所以字體不會混進素材牆。
 *
 * 生效範圍（重要，UI 上也要講清楚）：
 *   ✅ 自由畫布、AI 幫我排版產出的文字圖層 —— 那些是真的文字，字體換得掉
 *   ❌ AI 生圖裡的文字（產品套圖／單圖主視覺）—— 那是模型畫進畫素裡的圖片內容
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveBuffer } from "@/lib/storage";

/** 只收瀏覽器能直接當 webfont 用的格式。 */
const ALLOWED_EXT = ["woff2", "woff", "ttf", "otf"] as const;
/** 中文字體動輒 10–20MB；留一點餘裕但擋掉明顯不合理的檔案。 */
const MAX_BYTES = 30 * 1024 * 1024;

export type BrandFont = { id: string; name: string; url: string; format: string; family: string };

/** CSS font-family 名稱：用 id 產生，避免使用者取的名字含引號或逗號破壞 @font-face。 */
export const familyForFont = (id: string) => `brandfont-${id}`;

function parseFont(row: { id: string; name: string; data: string | null }): BrandFont | null {
  try {
    const d = JSON.parse(row.data ?? "{}") as { url?: string; format?: string };
    if (!d.url) return null;
    return { id: row.id, name: row.name, url: d.url, format: d.format ?? "opentype", family: familyForFont(row.id) };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  const rows = await db.styleComponent.findMany({
    where: { clientId, type: "FONT" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, data: true },
  });
  return NextResponse.json(rows.map(parseFont).filter(Boolean));
}

/** 副檔名 → @font-face 的 format() 值（兩者不完全同名）。 */
const formatForExt = (ext: string) =>
  ext === "woff2" ? "woff2" : ext === "woff" ? "woff" : ext === "ttf" ? "truetype" : "opentype";

async function createFont(clientId: string, name: string, url: string, format: string, fileName: string) {
  const row = await db.styleComponent.create({
    data: {
      clientId,
      type: "FONT",
      name: name.slice(0, 40),
      // StyleComponent 既有的必填欄位；字體沒有來源版型，填固定值標示出處。
      sourceLayoutId: "brand-font",
      data: JSON.stringify({ url, format, fileName }),
    },
    select: { id: true, name: true, data: true },
  });
  return parseFont(row);
}

/**
 * 兩種進入方式：
 *  1. JSON —— 瀏覽器已把檔案直傳到 Blob（見 ./blob/route.ts），這裡只登記 URL。
 *     正式站一定走這條，因為 Vercel 函式的 body 上限只有 4.5MB。
 *  2. multipart —— 本機沒設 Blob 時的退路，只適合小檔。
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    const clientId = String(body.clientId ?? "");
    const url = String(body.url ?? "");
    if (!clientId || !url) return NextResponse.json({ error: "clientId and url required" }, { status: 400 });
    const fileName = String(body.fileName ?? "");
    const ext = (fileName.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext as (typeof ALLOWED_EXT)[number])) {
      return NextResponse.json({ error: `只支援 ${ALLOWED_EXT.join(" / ")} 格式` }, { status: 400 });
    }
    const name = String(body.name ?? "").trim() || fileName.replace(/\.[^.]+$/, "");
    return NextResponse.json(await createFont(clientId, name, url, formatForExt(ext), fileName));
  }

  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const file = form.get("file");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "缺少字體檔" }, { status: 400 });

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXT.includes(ext as (typeof ALLOWED_EXT)[number])) {
    return NextResponse.json({ error: `只支援 ${ALLOWED_EXT.join(" / ")} 格式` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `字體檔請小於 ${MAX_BYTES / 1024 / 1024} MB` }, { status: 400 });
  }

  const url = await saveBuffer(Buffer.from(await file.arrayBuffer()), ext, "brandfont-");
  const name = String(form.get("name") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
  return NextResponse.json(await createFont(clientId, name, url, formatForExt(ext), file.name));
}
