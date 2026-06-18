-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT,
    "logoUrl" TEXT,
    "toneLabels" TEXT NOT NULL DEFAULT '[]',
    "taboos" TEXT NOT NULL DEFAULT '[]',
    "pastPostImageUrls" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Client" ("createdAt", "id", "logoUrl", "name", "primaryColor", "secondaryColor", "taboos", "toneLabels", "updatedAt") SELECT "createdAt", "id", "logoUrl", "name", "primaryColor", "secondaryColor", "taboos", "toneLabels", "updatedAt" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
