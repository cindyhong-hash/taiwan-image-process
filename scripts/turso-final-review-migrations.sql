-- ============================================================================
-- Codex final-review 之後「新增」的 Turso migrations（產品套圖加固：lease / cleanup）
-- 這些是在你先前已套用的「產品 schema（Product / visualProfile / LibraryImage.productId,assetRole）」
-- 之後才新增的欄位與資料表。部署新版前，先把這份套到 production Turso。
--
-- 執行：
--   turso db shell <你的-db-名稱> < scripts/turso-final-review-migrations.sql
--
-- 注意：ALTER TABLE ADD COLUMN 若欄位已存在會報錯（代表該段已套過），可略過該行後續跑。
-- ============================================================================

-- 1) product image-set leases（付費生成擁有權 CAS）
ALTER TABLE "Product" ADD COLUMN "paidOperationLeaseId" TEXT;
ALTER TABLE "Product" ADD COLUMN "paidOperationLeaseExpiresAt" DATETIME;
ALTER TABLE "Product" ADD COLUMN "paidOperationKind" TEXT;

ALTER TABLE "LibraryImage" ADD COLUMN "generationLeaseId" TEXT;
ALTER TABLE "LibraryImage" ADD COLUMN "generationLeaseExpiresAt" DATETIME;

CREATE INDEX "Product_paidOperationLeaseExpiresAt_idx"
ON "Product"("paidOperationLeaseExpiresAt");

CREATE INDEX "LibraryImage_productId_status_generationLeaseExpiresAt_idx"
ON "LibraryImage"("productId", "status", "generationLeaseExpiresAt");

-- 2) image asset cleanup jobs（去背/生成失敗後的 blob 清理墓碑）
CREATE TABLE "ImageAssetCleanupJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "libraryImageId" TEXT NOT NULL,
    "generationLeaseId" TEXT NOT NULL,
    "assetUrl" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ImageAssetCleanupJob_assetUrl_key" ON "ImageAssetCleanupJob"("assetUrl");
CREATE INDEX "ImageAssetCleanupJob_productId_createdAt_idx" ON "ImageAssetCleanupJob"("productId", "createdAt");

-- 3) cleanup job leases（cleanup worker 的原子競爭保護）
ALTER TABLE "ImageAssetCleanupJob" ADD COLUMN "cleanupLeaseId" TEXT;
ALTER TABLE "ImageAssetCleanupJob" ADD COLUMN "cleanupLeaseExpiresAt" DATETIME;

CREATE INDEX "ImageAssetCleanupJob_cleanupLeaseExpiresAt_createdAt_idx"
ON "ImageAssetCleanupJob"("cleanupLeaseExpiresAt", "createdAt");
