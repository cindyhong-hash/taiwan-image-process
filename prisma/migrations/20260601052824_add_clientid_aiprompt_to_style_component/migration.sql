-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StyleComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "sourceLayoutId" TEXT NOT NULL,
    "clientId" TEXT,
    "aiPromptText" TEXT NOT NULL DEFAULT '',
    "previewUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_StyleComponent" ("createdAt", "data", "id", "name", "previewUrl", "sourceLayoutId", "type") SELECT "createdAt", "data", "id", "name", "previewUrl", "sourceLayoutId", "type" FROM "StyleComponent";
DROP TABLE "StyleComponent";
ALTER TABLE "new_StyleComponent" RENAME TO "StyleComponent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
