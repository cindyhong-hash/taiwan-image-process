// scripts/apply-product-schema-turso.mjs
// ───────────────────────────────────────────────────────────────────────────
// 把「商品套圖」需要的【純新增】schema 套到 Turso 正式 DB。
//   - 新增 Product 表（含 visualProfile* 欄位）
//   - LibraryImage 新增 productId / assetRole 欄位
//   - 建立對應索引
// 只做 CREATE TABLE / ADD COLUMN / CREATE INDEX，全部 idempotent、可安全重跑，
// 不會 DROP、不會改動任何既有資料。不加 FK constraint（避免正式站重建表；
// Prisma 以 scalar 欄位處理關聯，app 執行完全不需要 DB 層 FK）。
//
// 跑法（在 quality worktree，且已有 .env.production.local）：
//   node --env-file=.env.production.local scripts/apply-product-schema-turso.mjs
// ───────────────────────────────────────────────────────────────────────────
import { createClient } from "@libsql/client";

// 去掉值兩邊可能殘留的引號/空白（node --env-file 有時不會處理）
const clean = (v) => (v ?? "").trim().replace(/^['"]|['"]$/g, "");
const url = clean(process.env.DATABASE_URL);
const authToken = clean(process.env.DATABASE_AUTH_TOKEN);
if (!url || !authToken) {
  console.error("缺 DATABASE_URL / DATABASE_AUTH_TOKEN —— 請用 --env-file=.env.production.local 執行");
  process.exit(1);
}
const scheme = (url.split("://")[0] || "").slice(0, 20);
console.log("偵測到 DATABASE_URL scheme：", JSON.stringify(scheme), "（只印前綴，不含機密）");
if (url.startsWith("file:")) {
  console.error("DATABASE_URL 指向本機 file: —— 這支是要對【正式 Turso】跑，請確認用 .env.production.local");
  process.exit(1);
}
if (!/^(libsql|https?|wss?)$/.test(scheme)) {
  console.error(`scheme「${scheme}」不是 @libsql/client 支援的（libsql/https/wss）。請把上面這行 scheme 貼給我，先別繼續。`);
  process.exit(1);
}

const db = createClient({ url, authToken });

async function columns(table) {
  try {
    const r = await db.execute(`PRAGMA table_info(${table})`);
    return r.rows.map((x) => x.name);
  } catch {
    return null; // 表不存在
  }
}

async function main() {
  console.log("目標 Turso DB：", url.replace(/\?.*$/, "").slice(0, 40) + "…");

  // ── 前置健檢：LibraryImage 應該已存在（正式站既有），Product 應該尚未存在 ──
  const liCols = await columns("LibraryImage");
  if (!liCols) throw new Error("正式 DB 找不到 LibraryImage 表 —— 連錯 DB？中止。");
  const liCount = (await db.execute("select count(*) n from LibraryImage")).rows[0].n;
  console.log(`LibraryImage 現有 ${liCount} 筆（不會被更動）`);

  // ── 1) Product 表（含 visualProfile*）──
  const beforeProduct = await columns("Product");
  if (!beforeProduct) {
    await db.execute(`
      CREATE TABLE "Product" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "clientId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "category" TEXT,
        "rawImageUrls" TEXT NOT NULL DEFAULT '[]',
        "heroImageUrl" TEXT,
        "primaryColorOverride" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "visualProfileJson" TEXT NOT NULL DEFAULT '{}',
        "visualProfileSourceHash" TEXT,
        "visualProfileUpdatedAt" DATETIME
      )
    `);
    console.log("✓ 建立 Product 表（含 visualProfile*）");
  } else {
    console.log("· Product 表已存在，檢查 visualProfile 欄位…");
    const add = async (name, ddl) => {
      if (!beforeProduct.includes(name)) { await db.execute(ddl); console.log(`  ✓ ADD ${name}`); }
      else console.log(`  · ${name} 已有`);
    };
    await add("visualProfileJson", `ALTER TABLE "Product" ADD COLUMN "visualProfileJson" TEXT NOT NULL DEFAULT '{}'`);
    await add("visualProfileSourceHash", `ALTER TABLE "Product" ADD COLUMN "visualProfileSourceHash" TEXT`);
    await add("visualProfileUpdatedAt", `ALTER TABLE "Product" ADD COLUMN "visualProfileUpdatedAt" DATETIME`);
  }

  // ── 2) LibraryImage 新增 productId / assetRole ──
  const addLi = async (name, ddl) => {
    if (!liCols.includes(name)) { await db.execute(ddl); console.log(`✓ LibraryImage ADD ${name}`); }
    else console.log(`· LibraryImage.${name} 已有`);
  };
  await addLi("productId", `ALTER TABLE "LibraryImage" ADD COLUMN "productId" TEXT`);
  await addLi("assetRole", `ALTER TABLE "LibraryImage" ADD COLUMN "assetRole" TEXT`);

  // ── 3) 索引 ──
  await db.execute(`CREATE INDEX IF NOT EXISTS "LibraryImage_productId_idx" ON "LibraryImage"("productId")`);
  await db.execute(`CREATE INDEX IF NOT EXISTS "Product_clientId_updatedAt_idx" ON "Product"("clientId","updatedAt")`);
  console.log("✓ 索引就緒");

  // ── 驗證 ──
  const p = await columns("Product");
  const li = await columns("LibraryImage");
  console.log("\n=== 完成後 ===");
  console.log("Product 欄位:", p.join(", "));
  console.log("LibraryImage productId?", li.includes("productId"), "| assetRole?", li.includes("assetRole"));
  const liAfter = (await db.execute("select count(*) n from LibraryImage")).rows[0].n;
  console.log(`LibraryImage 筆數（應與先前一致 ${liCount}）:`, liAfter);
  console.log("\n✅ Turso schema 已套用，資料未更動。");
}

main().then(() => process.exit(0)).catch((e) => { console.error("失敗:", e.message); process.exit(1); });
