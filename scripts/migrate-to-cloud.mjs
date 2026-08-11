// scripts/migrate-to-cloud.mjs
// ───────────────────────────────────────────────────────────────────────────
// 一次性搬資料：本機 SQLite (prisma/dev.db) + public/uploads/ 圖片
//            → Turso（雲端 DB）+ Vercel Blob（雲端圖片）
//
// 前置：
//   1. Turso db 已建立，且已對住個 db 跑過 `npx prisma db push`（dest 要有 schema）
//   2. Vercel project 已建立 Blob store
//   3. 跑 `vercel env pull .env.production.local` 攞到 DATABASE_URL /
//      DATABASE_AUTH_TOKEN / BLOB_READ_WRITE_TOKEN
//
// 跑法：  npm run migrate-to-cloud
// （讀本機 dev.db 做 source，唔會改動佢；只會寫入 dest DB + 上傳圖片去 Blob。
//  用 upsert，可以安全重跑。）
// ───────────────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { put } from "@vercel/blob";

if (!process.env.DATABASE_URL || !process.env.DATABASE_AUTH_TOKEN) {
  console.error("缺 DATABASE_URL / DATABASE_AUTH_TOKEN —— 先跑 `vercel env pull .env.production.local`");
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("缺 BLOB_READ_WRITE_TOKEN —— 先去 Vercel dashboard 建立 Blob store");
  process.exit(1);
}

const source = new PrismaClient({ adapter: new PrismaLibSql({ url: "file:./prisma/dev.db" }) });
const dest = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN }),
});

const blobCache = new Map(); // "/uploads/xxx.jpg" → 新 blob url

function contentTypeForExt(ext) {
  const e = ext.toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  return "image/jpeg";
}

async function migrateUrl(url) {
  if (!url || typeof url !== "string" || !url.startsWith("/uploads/")) return url;
  if (blobCache.has(url)) return blobCache.get(url);
  try {
    const buf = await readFile(join(process.cwd(), "public", url));
    const ext = url.split("?")[0].split(".").pop() || "jpg";
    const filename = url.split("/").pop();
    const blob = await put(filename, buf, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true, // script 可以安全重跑：同一檔名唔會因為「已存在」而報錯
      contentType: contentTypeForExt(ext),
    });
    blobCache.set(url, blob.url);
    console.log(`    ${url} → ${blob.url}`);
    return blob.url;
  } catch (e) {
    console.warn(`    ⚠️ 讀唔到 ${url}，保留原路徑：${e.message}`);
    return url;
  }
}

async function migrateUrlArrayJson(json) {
  let arr;
  try { arr = JSON.parse(json || "[]"); } catch { return json; }
  if (!Array.isArray(arr)) return json;
  return JSON.stringify(await Promise.all(arr.map(migrateUrl)));
}

async function main() {
  console.log("=== 1. Clients ===");
  const clients = await source.client.findMany();
  for (const c of clients) {
    const logoUrl = await migrateUrl(c.logoUrl);
    const pastPostImageUrls = await migrateUrlArrayJson(c.pastPostImageUrls);
    const data = { ...c, logoUrl, pastPostImageUrls };
    await dest.client.upsert({ where: { id: c.id }, create: data, update: data });
  }
  console.log(`  ${clients.length} 個品牌已搬\n`);

  console.log("=== 2. Activities ===");
  const activities = await source.activity.findMany();
  for (const a of activities) {
    const productImageUrl = await migrateUrl(a.productImageUrl);
    const productImageUrls = await migrateUrlArrayJson(a.productImageUrls);
    const referenceImageUrls = await migrateUrlArrayJson(a.referenceImageUrls);
    const baseImageUrl = a.baseImageUrl ? await migrateUrl(a.baseImageUrl) : a.baseImageUrl;
    const data = { ...a, productImageUrl, productImageUrls, referenceImageUrls, baseImageUrl };
    await dest.activity.upsert({ where: { id: a.id }, create: data, update: data });
  }
  console.log(`  ${activities.length} 個活動已搬\n`);

  console.log("=== 3. GeneratedLayouts ===");
  const layouts = await source.generatedLayout.findMany();
  for (const l of layouts) {
    const imageUrl = await migrateUrl(l.imageUrl);
    const data = { ...l, imageUrl };
    await dest.generatedLayout.upsert({ where: { id: l.id }, create: data, update: data });
  }
  console.log(`  ${layouts.length} 個生成版面已搬\n`);

  console.log("=== 4. StyleComponents ===");
  const components = await source.styleComponent.findMany();
  for (const sc of components) {
    const previewUrl = sc.previewUrl ? await migrateUrl(sc.previewUrl) : sc.previewUrl;
    // BACKGROUND 類型嘅 data 係 {"imageUrl":"/uploads/..."}——收埋喺 JSON 入面嘅圖，唔係扁平欄位，要另外揸出嚟搬。
    let componentData = sc.data;
    try {
      const parsed = JSON.parse(sc.data || "{}");
      if (parsed.imageUrl) {
        parsed.imageUrl = await migrateUrl(parsed.imageUrl);
        componentData = JSON.stringify(parsed);
      }
    } catch { /* 唔係 JSON 或者冇 imageUrl → 原樣保留 */ }
    const data = { ...sc, previewUrl, data: componentData };
    await dest.styleComponent.upsert({ where: { id: sc.id }, create: data, update: data });
  }
  console.log(`  ${components.length} 個風格組件已搬\n`);

  console.log("=== 5. LibraryImages ===");
  const images = await source.libraryImage.findMany();
  for (const img of images) {
    const imageUrl = await migrateUrl(img.imageUrl);
    const data = { ...img, imageUrl };
    await dest.libraryImage.upsert({ where: { id: img.id }, create: data, update: data });
  }
  console.log(`  ${images.length} 張素材已搬\n`);

  console.log(`✅ 完成。${blobCache.size} 張唯一圖片已上傳去 Vercel Blob。`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => {
    await source.$disconnect();
    await dest.$disconnect();
  });
