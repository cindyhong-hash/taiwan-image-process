ALTER TABLE "Product" ADD COLUMN "paidOperationLeaseId" TEXT;
ALTER TABLE "Product" ADD COLUMN "paidOperationLeaseExpiresAt" DATETIME;
ALTER TABLE "Product" ADD COLUMN "paidOperationKind" TEXT;

ALTER TABLE "LibraryImage" ADD COLUMN "generationLeaseId" TEXT;
ALTER TABLE "LibraryImage" ADD COLUMN "generationLeaseExpiresAt" DATETIME;

CREATE INDEX "Product_paidOperationLeaseExpiresAt_idx"
ON "Product"("paidOperationLeaseExpiresAt");

CREATE INDEX "LibraryImage_productId_status_generationLeaseExpiresAt_idx"
ON "LibraryImage"("productId", "status", "generationLeaseExpiresAt");
