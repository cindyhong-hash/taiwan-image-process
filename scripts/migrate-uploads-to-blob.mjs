// 一次性遷移：把 dev.db 引用到的本機 /uploads 圖片上傳到 Vercel Blob，
// 並在 dev.db 副本裡把所有 /uploads/... URL 改寫成 blob 公開 URL。
// 產出 prisma/dev.db.turso（給 Turso 匯入用）。原 dev.db 不動。
import { put } from "@vercel/blob";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC_DB = join(ROOT, "prisma", "dev.db");
const WORK_DB = join(ROOT, "prisma", "dev.db.turso");
const DUMP = join(ROOT, "prisma", "_dump.sql");
const DUMP2 = join(ROOT, "prisma", "_dump.migrated.sql");
const UPLOADS = join(ROOT, "public", "uploads");

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) { console.error("缺 BLOB_READ_WRITE_TOKEN"); process.exit(1); }

function ctype(ext) {
  const e = ext.toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  return "image/jpeg";
}

// 1. dump 原庫
execFileSync("sqlite3", [SRC_DB, ".dump"], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
const dumpBuf = execFileSync("sqlite3", [SRC_DB, ".dump"], { maxBuffer: 512 * 1024 * 1024 });
let sql = dumpBuf.toString("utf8");

// 2. 抽出唯一 /uploads/ 參考
const refs = [...new Set(sql.match(/\/uploads\/[^"'\s,)\]]+/g) || [])];
console.log(`dev.db 引用 ${refs.length} 張圖`);

// 3. 逐張上傳 Blob（批次併發），建立 map
const map = new Map();
const missing = [];
let done = 0;
const CONC = 8;
async function worker(list) {
  for (const ref of list) {
    const fname = ref.replace("/uploads/", "");
    const fpath = join(UPLOADS, fname);
    if (!existsSync(fpath)) { missing.push(ref); continue; }
    const ext = fname.split(".").pop() || "jpg";
    const body = readFileSync(fpath);
    const blob = await put(fname, body, {
      access: "public", addRandomSuffix: false, contentType: ctype(ext), token,
    });
    map.set(ref, blob.url);
    done++;
    if (done % 25 === 0) console.log(`  已上傳 ${done}/${refs.length}`);
  }
}
const chunks = Array.from({ length: CONC }, (_, i) => refs.filter((_, idx) => idx % CONC === i));
await Promise.all(chunks.map(worker));
console.log(`上傳完成：${done} 張；找不到本機檔：${missing.length} 張`);
if (missing.length) console.log("  缺檔範例:", missing.slice(0, 5));

// 4. 在 dump 文字裡全域替換 URL
let replaced = 0;
for (const [local, url] of map) {
  const before = sql;
  sql = sql.split(local).join(url);
  if (sql !== before) replaced++;
}
console.log(`改寫 URL：${replaced} 種`);
writeFileSync(DUMP2, sql);

// 5. 用改好的 dump 重建新 db
if (existsSync(WORK_DB)) rmSync(WORK_DB);
execFileSync("sqlite3", [WORK_DB], { input: sql });
console.log(`✅ 產出 ${WORK_DB}`);

// 6. 驗證：新 db 裡還有沒有殘留 /uploads
const leftover = execFileSync("sqlite3", [WORK_DB, ".dump"], { maxBuffer: 512 * 1024 * 1024 })
  .toString("utf8").match(/\/uploads\//g);
console.log(`新 db 殘留 /uploads 參考：${leftover ? leftover.length : 0}（0 = 全部改成 blob）`);

try { rmSync(DUMP); } catch {}
