-- CreateTable
CREATE TABLE "MonthlyMarketingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "goals" TEXT NOT NULL DEFAULT '[]',
    "totalPostCount" INTEGER NOT NULL DEFAULT 12,
    "platforms" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "strategyJson" TEXT NOT NULL DEFAULT '{}',
    "signalsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyMarketingPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthlyPlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "goals" TEXT NOT NULL DEFAULT '[]',
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "allocationJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketingCampaign_monthlyPlanId_fkey" FOREIGN KEY ("monthlyPlanId") REFERENCES "MonthlyMarketingPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL DEFAULT 'library',
    "sourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignImportantDate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignImportantDate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentPlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthlyPlanId" TEXT NOT NULL,
    "campaignId" TEXT,
    "contentType" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "contentDirection" TEXT NOT NULL DEFAULT '',
    "recommendationReason" TEXT NOT NULL DEFAULT '',
    "sourceSignals" TEXT NOT NULL DEFAULT '[]',
    "format" TEXT NOT NULL DEFAULT 'SINGLE',
    "platforms" TEXT NOT NULL DEFAULT '[]',
    "scheduledDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "generatedActivityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentPlanItem_monthlyPlanId_fkey" FOREIGN KEY ("monthlyPlanId") REFERENCES "MonthlyMarketingPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentPlanItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ContentPlanItem_generatedActivityId_fkey" FOREIGN KEY ("generatedActivityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MonthlyMarketingPlan_clientId_updatedAt_idx" ON "MonthlyMarketingPlan"("clientId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyMarketingPlan_clientId_year_month_key" ON "MonthlyMarketingPlan"("clientId", "year", "month");

-- CreateIndex
CREATE INDEX "MarketingCampaign_monthlyPlanId_sortOrder_idx" ON "MarketingCampaign"("monthlyPlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "CampaignProduct_campaignId_idx" ON "CampaignProduct"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignImportantDate_campaignId_date_idx" ON "CampaignImportantDate"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPlanItem_generatedActivityId_key" ON "ContentPlanItem"("generatedActivityId");

-- CreateIndex
CREATE INDEX "ContentPlanItem_monthlyPlanId_sortOrder_idx" ON "ContentPlanItem"("monthlyPlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "ContentPlanItem_campaignId_idx" ON "ContentPlanItem"("campaignId");

-- CreateIndex
CREATE INDEX "ContentPlanItem_scheduledDate_idx" ON "ContentPlanItem"("scheduledDate");
