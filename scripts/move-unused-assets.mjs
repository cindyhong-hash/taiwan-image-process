// scripts/move-unused-assets.mjs
// ───────────────────────────────────────────────────────────────────────────
// 將「未採用素材」（clientId = null 嘅 LibraryImage / StyleComponent 所引用嘅檔）
// 由 public/uploads/ 「移走」到隔離資料夾 .backup/unused-<日期>/，**唔刪、可還原**。
//
// ★ 安全設計：
//   1. 預設 dry-run —— 淨係列出「會移」邊啲檔 + 合計大小，唔郁任何嘢。
//      真正移走要加 --apply。
//   2. 排除共用檔 —— 若同一實體檔亦被任何「在用」記錄引用
//      （有品牌嘅 image/component、client logo、pastPost、活動 產品圖/參考圖、layout 圖），
//      就唔會移（避免整爛在用圖）。
//   3. 唔改資料庫 —— DB 記錄照留（clientId=null 依然存在，/unassigned 頁仍列到，
//      只係縮圖會 404 直到還原）。想連 DB 一齊清係另一件事（未做）。
//
// 跑法：
//   node scripts/move-unused-assets.mjs            # dry-run（睇會移咩）
//   node scripts/move-unused-assets.mjs --apply    # 真正移走到 .backup/unused-<日期>/
//
// 還原：將 .backup/unused-<日期>/public/uploads/* 複製返入 public/uploads/ 即可。
// ───────────────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { statSync, mkdirSync, renameSync, copyFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();
const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const adapter = new PrismaLibSql({ url: url.startsWith("file:") ? url : `file:${url}` });
const db = new PrismaClient({ adapter });

// /uploads/xxx.jpg → 絕對檔案路徑；外部 URL（http…）或空值 → null（唔關本地檔事）
function toFilePath(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return null;
  return path.join(ROOT, "public", imageUrl.replace(/^\//, ""));
}
function sizeOf(fp) { try { return statSync(fp).size; } catch { return null; } }
// 安全 parse JSON array 欄位（pastPostImageUrls / productImageUrls / referenceImageUrls）
function parseArr(s) { try { const a = JSON.parse(s ?? "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }

const [clients, activities, layouts, comps, images] = await Promise.all([
  db.client.findMany(),
  db.activity.findMany(),
  db.generatedLayout.findMany(),
  db.styleComponent.findMany(),
  db.libraryImage.findMany(),
]);

// 1) 「在用」檔集合 —— 任何被以下記錄引用嘅 /uploads 檔，一律唔郁
const usedFiles = new Set();
const markUsed = (u) => { const fp = toFilePath(u); if (fp) usedFiles.add(fp); };
clients.forEach((c) => { markUsed(c.logoUrl); parseArr(c.pastPostImageUrls).forEach(markUsed); });
activities.forEach((a) => { markUsed(a.productImageUrl); parseArr(a.productImageUrls).forEach(markUsed); parseArr(a.referenceImageUrls).forEach(markUsed); });
layouts.forEach((l) => markUsed(l.imageUrl));
comps.filter((c) => c.clientId != null).forEach((c) => markUsed(c.previewUrl));
images.filter((i) => i.clientId != null).forEach((i) => markUsed(i.imageUrl));

// 2) 「未採用」候選檔 —— clientId=null 嘅 LibraryImage / StyleComponent
const candidates = new Map(); // filePath → { url, kind, bytes }
const addCand = (u, kind) => {
  const fp = toFilePath(u);
  if (!fp || candidates.has(fp)) return;
  candidates.set(fp, { url: u, kind, bytes: sizeOf(fp) });
};
images.filter((i) => i.clientId == null).forEach((i) => addCand(i.imageUrl, "LibraryImage"));
comps.filter((c) => c.clientId == null).forEach((c) => addCand(c.previewUrl, `StyleComponent(${c.type})`));

// 3) 分流：可移 vs 因共用而跳過 vs 檔案已唔存在
const toMove = [], sharedSkip = [], missing = [];
for (const [fp, v] of candidates) {
  if (usedFiles.has(fp)) { sharedSkip.push([fp, v]); continue; }
  if (v.bytes == null || !existsSync(fp)) { missing.push([fp, v]); continue; }
  toMove.push([fp, v]);
}
toMove.sort((a, b) => (b[1].bytes ?? 0) - (a[1].bytes ?? 0));
const totalBytes = toMove.reduce((s, [, v]) => s + (v.bytes ?? 0), 0);
const mb = (b) => (b / 1024 / 1024).toFixed(1);

console.log(`\n${APPLY ? "🚚 APPLY 模式（真正移走）" : "🔍 DRY-RUN（唔會郁任何嘢，加 --apply 先真移）"}`);
console.log(`── 未採用候選：${candidates.size} 個檔`);
console.log(`   ✅ 會移走：${toMove.length} 個 = ${mb(totalBytes)} MB`);
console.log(`   ⏭️  因在用共用而跳過：${sharedSkip.length} 個`);
console.log(`   ⚠️  DB 有記錄但檔已唔存在：${missing.length} 個`);
if (sharedSkip.length) {
  console.log("\n   跳過（共用檔，保留）：");
  sharedSkip.slice(0, 20).forEach(([fp]) => console.log(`     · ${path.relative(ROOT, fp)}`));
  if (sharedSkip.length > 20) console.log(`     … 另 ${sharedSkip.length - 20} 個`);
}

if (!APPLY) {
  console.log("\n預覽（最大 15 個）：");
  toMove.slice(0, 15).forEach(([fp, v]) => console.log(`  ${mb(v.bytes).padStart(6)} MB  ${path.relative(ROOT, fp)}  [${v.kind}]`));
  if (toMove.length > 15) console.log(`  … 另 ${toMove.length - 15} 個`);
  console.log(`\n確認冇問題就跑：node scripts/move-unused-assets.mjs --apply`);
  await db.$disconnect();
  process.exit(0);
}

// 4) APPLY：移去 .backup/unused-<日期>/<相對 ROOT 路徑>（保留 public/uploads 結構，易還原）
const stamp = new Date().toISOString().slice(0, 10);
const destRoot = path.join(ROOT, ".backup", `unused-${stamp}`);
let moved = 0;
for (const [fp] of toMove) {
  const rel = path.relative(ROOT, fp);              // public/uploads/xxx.jpg
  const dest = path.join(destRoot, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  try {
    renameSync(fp, dest);                            // 同碟直接 rename（快）
  } catch {
    copyFileSync(fp, dest); unlinkSync(fp);          // 跨裝置 fallback
  }
  moved++;
}
console.log(`\n✅ 已移走 ${moved} 個檔 (${mb(totalBytes)} MB) → ${path.relative(ROOT, destRoot)}/`);
console.log(`   DB 未改（clientId=null 記錄仍在，/unassigned 縮圖會 404 直到還原）。`);
console.log(`   還原：cp -R ${path.relative(ROOT, destRoot)}/public/uploads/. public/uploads/`);
console.log(`   跑埋 npm run unused-assets 可更新只讀清單。`);
await db.$disconnect();
