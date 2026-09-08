# Product Image Set — 精簡 Handoff

只記三個接手時最容易改壞的邊界；完整功能與 review 結果請看 `final-review-fix-report`。

## 1. Model router

檔案：`src/lib/products/image-set-model-router.ts`

- `background`、`decoration` 是「不放產品本體」的素材，所以只走文字生圖（目前 `flux-2-pro`），故意不餵產品 reference。`decoration` 生成後還要走 `removeBg`；去背失敗要整個 role 失敗，不能把不透明背景當透明裝飾交出去。
- 需要保留產品身份的 `hero` / `detail` / `lifestyle` 走 reference pipeline：**GPT → Seedream → FLUX edit**。每次 provider 拋錯才進下一個；`AbortSignal` 已中止時直接停止，不能把逾時誤當成可付費 fallback。缺 reference 直接失敗，不會改用 text-only 亂猜產品。
- reference 會去重、最多 5 張；產品 hero/raw 是身份證據，`batchHeroImageUrl` 只能是最後面的風格錨點，不能混進產品身份 quota。不要把 batch hero 改成一般 reference，也不要把 edit role 改接 textImage。
- router 回傳的 `provider` 必須是可追蹤的具體 provider；上層會拒絕 `unreported`／合成標記。新增 fallback 時要維持這個 trace，否則圖片即使產出也不會被標成 DONE。

## 2. Visual profile 分析

檔案：`product-visual-profile.ts`、`product-visual-analysis.ts`

輸入是產品的 `name`、`description`、`category`、`rawImageUrls[]`、`heroImageUrl`。URL 去重後最多 5 張，載入並縮到最長邊 1600px PNG，送 OpenRouter vision；模型只准回嚴格 JSON。解析失敗、沒有圖片或 vision 失敗時，回 deterministic fallback，不自行補產品事實。

`visualProfileJson` 的核心形狀：

```json
{
  "version": 1,
  "productType": "string",
  "productArchetype": "beauty_device | skincare | cosmetics | food_beverage | fashion | electronics | home | other",
  "confidence": 0,
  "appearance": {
    "shape": "string",
    "materials": [], "colors": [], "distinctiveDetails": [], "visibleTextOrLogos": []
  },
  "useCases": [], "suitableScenes": [], "visualMotifs": [], "prohibitedChanges": [],
  "sourceImageCount": 0
}
```

- `visualProfileSourceHash` 是 `name/description/category`（trim 後）+ 排序後 raw URL + hero URL 的 SHA-256。GET 只有在 JSON 可 parse 且 hash 等於目前輸入時才用快取；任何產品文字或圖片來源改變都會 stale。
- `visualProfileUpdatedAt` 用於 force analysis cooldown：最近 60 秒完成過分析時，`force=true` 先回 429，不取得付費 lease、不呼叫 vision。真正寫回 profile 還要通過 product lease 與 database-time CAS，不能只靠 request 端時間判斷。
- 改 JSON 欄位、`version`、vision prompt 或 fallback 時，要同步檢查：`parseProductVisualProfile`、`SYSTEM_PROMPT`、`fallbackProductVisualProfile`、`buildImageSetArtDirection`、role planner/prompt、既有 profile cache/hash 與 image-set params parser。把 `version` 從 1 改掉會讓舊 profile 與已存套圖 params 全部失效；改 hash canonicalization 會讓大量產品重新分析。

## 3. Production Turso migration（DB `marketing-tool`）

目前 Prisma schema/migrations 是版本權威，但正式 Turso 不能直接當一般本機 SQLite 跑 `prisma migrate deploy`：Turso/libSQL 是 HTTP 連線，Prisma 官方建議用本機 SQLite 產生 migration，再用 Turso CLI 套 SQL。`next build` 只建置程式，**不會**替 production migration。

標準步驟：

1. 修改 `prisma/schema.prisma`，用本機 SQLite 產生並檢查 migration：

   ```bash
   DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev --name <name> --create-only
   ```

   確認 `prisma/migrations/<timestamp>_<name>/migration.sql` 沒有破壞性操作，再 commit schema + migration。
2. 在正式站 deploy 前，針對 `marketing-tool` 套用該 SQL：

   ```bash
   turso db shell marketing-tool < prisma/migrations/<timestamp>_<name>/migration.sql
   ```

   套完用 `turso db shell marketing-tool` 查欄位/index，再 deploy Vercel。不要再使用已刪除的 `apply-product-schema-turso.mjs`，也不要把 build script 偷塞 migration。
3. 若需要 staging，先對 staging Turso DB 做同樣的 `turso db shell`，確認成功後才上 production。

這次的 `20260907090000_add_product_image_set_leases`、`20260907140000_add_image_asset_cleanup_jobs`、`20260907160000_add_cleanup_job_leases` 已經用 `turso db shell` 套到 production，但沒有對應 `_prisma_migrations` 紀錄。以目前 Turso 的官方工作流，這**不影響 runtime**，也不需要硬補假紀錄；migration 檔案本身仍是 repo 的審計與部署清單。不要混用「手動套 SQL」和「對遠端 Turso 跑 `prisma migrate deploy`」。若未來要改成另一套由 Prisma 管理 production history 的流程，應先另做一次完整 baseline/對帳，再決定是否使用 `migrate resolve --applied`，不要直接對這三筆補紀錄。

參考：[Prisma Turso schema changes](https://docs.prisma.io/docs/orm/v6/overview/databases/turso)、[Turso + Prisma migrations](https://docs.turso.tech/sdk/ts/orm/prisma)。
