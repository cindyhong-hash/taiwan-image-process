-- CreateTable
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LibraryImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL DEFAULT '',
    "copyText" TEXT,
    "subject" TEXT,
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "errorMessage" TEXT,
    "batchId" TEXT,
    "productId" TEXT,
    "assetRole" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LibraryImage" ("batchId", "clientId", "copyText", "createdAt", "errorMessage", "id", "imageUrl", "paramsJson", "prompt", "status", "subject") SELECT "batchId", "clientId", "copyText", "createdAt", "errorMessage", "id", "imageUrl", "paramsJson", "prompt", "status", "subject" FROM "LibraryImage";
DROP TABLE "LibraryImage";
ALTER TABLE "new_LibraryImage" RENAME TO "LibraryImage";
CREATE INDEX "LibraryImage_productId_idx" ON "LibraryImage"("productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Product_clientId_updatedAt_idx" ON "Product"("clientId", "updatedAt");

