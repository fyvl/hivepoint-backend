CREATE TYPE "UsageIngestJobStatus" AS ENUM ('PENDING', 'FAILED', 'PROCESSED');

CREATE TABLE "UsageIngestJob" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL,
    "status" "UsageIngestJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageIngestJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UsageRecord"
ADD COLUMN "sourceJobId" TEXT;

CREATE UNIQUE INDEX "UsageRecord_sourceJobId_key" ON "UsageRecord"("sourceJobId");
CREATE INDEX "UsageIngestJob_status_availableAt_createdAt_idx" ON "UsageIngestJob"("status", "availableAt", "createdAt");
CREATE INDEX "UsageIngestJob_subscriptionId_createdAt_idx" ON "UsageIngestJob"("subscriptionId", "createdAt");

ALTER TABLE "UsageRecord"
ADD CONSTRAINT "UsageRecord_sourceJobId_fkey"
FOREIGN KEY ("sourceJobId") REFERENCES "UsageIngestJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsageIngestJob"
ADD CONSTRAINT "UsageIngestJob_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
