ALTER TABLE "ImageAssetCleanupJob" ADD COLUMN "cleanupLeaseId" TEXT;
ALTER TABLE "ImageAssetCleanupJob" ADD COLUMN "cleanupLeaseExpiresAt" DATETIME;

CREATE INDEX "ImageAssetCleanupJob_cleanupLeaseExpiresAt_createdAt_idx"
ON "ImageAssetCleanupJob"("cleanupLeaseExpiresAt", "createdAt");
