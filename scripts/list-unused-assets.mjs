// scripts/list-unused-assets.mjs
// ───────────────────────────────────────────────────────────────────────────
// 列出「未分類素材」（clientId = null）—— 即係喺素材庫被移出所有品牌、從畫面隱藏
// 嘅未採用圖。輸出檔案路徑 + 大小，並重新生成 docs/UNUSED-ASSETS.md。
//
// 用途：日後想 recover（搬返某品牌）或 clean（刪檔慳空間）時，有一份可靠清單。
//
// 跑法：  node scripts/list-unused-assets.mjs
// （只讀資料庫，唔會刪任何嘢、唔會改資料庫。）
// ───────────────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const adapter = new PrismaLibSql({ url: url.startsWith("file:") ? url : `file:${url}` });
const db = new PrismaClient({ adapter });

function toFilePath(imageUrl) {
  // DB 存相對 URL（/uploads/xxx.jpg）；外部 URL（http…）唔關本地檔事，跳過。
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return null;
  return path.join(ROOT, "public", imageUrl.replace(/^\//, ""));
}

function sizeOf(filePath) {
  try { return statSync(filePath).size; } catch { return null; }
}

function fmtKB(bytes) {
  if (bytes == null) return "（檔案唔存在）";
  return `${(bytes / 1024).toFixed(0)} KB`;
}

const [images, comps] = await Promise.all([
  db.libraryImage.findMany({ where: { clientId: null }, orderBy: { createdAt: "desc" } }),
  db.styleComponent.findMany({ where: { clientId: null, previewUrl: { not: null } }, orderBy: { createdAt: "desc" } }),
]);

// 砌一份去重嘅檔案清單（同一張圖可能畀多個 component 共用）。
const rows = new Map(); // filePath → { url, kind, ids:[], bytes, createdAt }
function add(url, kind, id, createdAt) {
  const fp = toFilePath(url);
  if (!fp) return;
  const ex = rows.get(fp) ?? { url, kind, ids: [], bytes: sizeOf(fp), createdAt };
  if (!ex.ids.includes(id)) ex.ids.push(id);
  rows.set(fp, ex);
}
images.forEach((g) => add(g.imageUrl, "生成圖 LibraryImage", g.id, g.createdAt));
comps.forEach((c) => add(c.previewUrl, `組件 StyleComponent(${c.type})`, c.id, c.createdAt));

const list = [...rows.entries()].sort((a, b) => (b[1].bytes ?? 0) - (a[1].bytes ?? 0));
const totalBytes = list.reduce((s, [, v]) => s + (v.bytes ?? 0), 0);
const stamp = new Date().toISOString().slice(0, 10);

const lines = [];
lines.push("# 未採用素材清單（未分類素材 / clientId = null）");
lines.push("");
lines.push("> ⚠️ **此檔由 `scripts/list-unused-assets.mjs` 自動生成，請勿手改。**");
lines.push("> 重新生成：`node scripts/list-unused-assets.mjs`");
lines.push("");
lines.push("## 呢份清單係咩");
lines.push("");
lines.push("素材庫入面，被移入「未分類素材」（或單張大圖揀「未分類素材（從畫面隱藏）」）嘅圖，");
lines.push("資料庫 `clientId` 會設成 `null`。呢啲圖**唔再喺任何品牌工作區顯示**（側欄入口亦已隱藏），");
lines.push("等同「未採用 / 待處理」。佢哋嘅實體檔仍然留喺 `public/uploads/`，並未刪走。");
lines.push("");
lines.push("## 之後可以點處理");
lines.push("");
lines.push("- **Recover（攞返出嚟）**：用 URL 入 `/unassigned` 頁，揀返圖 → 「移到…」某個品牌即可。");
lines.push("- **Clean（清理慳空間）**：確認唔再需要後，可刪除下列檔案 + 對應資料庫記錄。");
lines.push("  ⚠️ 注意：`public/uploads/` 已喺 `.gitignore`，呢啲檔**本來就唔會上 GitHub**；");
lines.push("  清理只係慳本機 / 部署機嘅磁碟空間，唔影響 repo。");
lines.push("");
lines.push(`## 統計（${stamp}）`);
lines.push("");
lines.push(`- 未採用檔案數：**${list.length}**`);
lines.push(`- 佔用空間合計：**${(totalBytes / 1024 / 1024).toFixed(1)} MB**（${fmtKB(totalBytes)}）`);
lines.push("");
if (list.length === 0) {
  lines.push("_目前冇任何未分類素材。_");
} else {
  lines.push("| # | 檔案位置 | 來源 | 大小 | 建立日期 | DB id |");
  lines.push("|---|---------|------|------|---------|-------|");
  list.forEach(([fp, v], i) => {
    const rel = path.relative(ROOT, fp);
    const d = new Date(v.createdAt).toISOString().slice(0, 10);
    lines.push(`| ${i + 1} | \`${rel}\` | ${v.kind} | ${fmtKB(v.bytes)} | ${d} | ${v.ids.join(", ")} |`);
  });
}
lines.push("");

const outPath = path.join(ROOT, "docs", "UNUSED-ASSETS.md");
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`已寫入 ${path.relative(ROOT, outPath)}：${list.length} 個未採用檔案，合計 ${(totalBytes / 1024 / 1024).toFixed(1)} MB。`);

await db.$disconnect();
