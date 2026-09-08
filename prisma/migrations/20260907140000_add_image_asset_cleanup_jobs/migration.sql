-- Durable cleanup tombstones for blobs uploaded by workers that lose their generation lease.
-- No foreign key is intentional: cleanup must survive deletion of the originating row/product.
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
