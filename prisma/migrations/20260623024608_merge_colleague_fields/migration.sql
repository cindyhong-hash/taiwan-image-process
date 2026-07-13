-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "focusPoint" TEXT NOT NULL,
    "titleText" TEXT,
    "subtitleText" TEXT,
    "imagePrompt" TEXT,
    "productImageUrl" TEXT NOT NULL DEFAULT '',
    "productImageUrls" TEXT NOT NULL DEFAULT '[]',
    "referenceImageUrls" TEXT NOT NULL DEFAULT '[]',
    "selectedComponentIds" TEXT NOT NULL DEFAULT '[]',
    "imageRatio" TEXT NOT NULL DEFAULT '1:1',
    "imageModel" TEXT NOT NULL DEFAULT 'google/gemini-3-pro-image-preview',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Activity" ("clientId", "createdAt", "focusPoint", "id", "productImageUrl", "referenceImageUrls", "status", "theme") SELECT "clientId", "createdAt", "focusPoint", "id", "productImageUrl", "referenceImageUrls", "status", "theme" FROM "Activity";
DROP TABLE "Activity";
ALTER TABLE "new_Activity" RENAME TO "Activity";
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT,
    "logoUrl" TEXT,
    "toneLabels" TEXT NOT NULL DEFAULT '[]',
    "taboos" TEXT NOT NULL DEFAULT '[]',
    "commonText" TEXT NOT NULL DEFAULT '',
    "pastPostImageUrls" TEXT NOT NULL DEFAULT '[]',
    "paletteColors" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Client" ("createdAt", "id", "logoUrl", "name", "paletteColors", "pastPostImageUrls", "primaryColor", "secondaryColor", "taboos", "toneLabels", "updatedAt") SELECT "createdAt", "id", "logoUrl", "name", "paletteColors", "pastPostImageUrls", "primaryColor", "secondaryColor", "taboos", "toneLabels", "updatedAt" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE TABLE "new_GeneratedLayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "layoutType" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "copyText" TEXT NOT NULL,
    "styleComponents" TEXT NOT NULL DEFAULT '{}',
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "textBurnedIn" BOOLEAN NOT NULL DEFAULT false,
    "savedToLibrary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedLayout_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GeneratedLayout" ("activityId", "copyText", "createdAt", "id", "imageUrl", "isSelected", "layoutType", "styleComponents") SELECT "activityId", "copyText", "createdAt", "id", "imageUrl", "isSelected", "layoutType", "styleComponents" FROM "GeneratedLayout";
DROP TABLE "GeneratedLayout";
ALTER TABLE "new_GeneratedLayout" RENAME TO "GeneratedLayout";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
