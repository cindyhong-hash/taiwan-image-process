ALTER TABLE "Product" ADD COLUMN "visualProfileJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Product" ADD COLUMN "visualProfileSourceHash" TEXT;
ALTER TABLE "Product" ADD COLUMN "visualProfileUpdatedAt" DATETIME;
