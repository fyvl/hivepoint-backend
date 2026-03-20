ALTER TABLE "UsageRecord"
ADD COLUMN "aggregatedAt" TIMESTAMP(3);

CREATE TABLE "UsageDailyAggregate" (
    "subscriptionId" TEXT NOT NULL,
    "bucketDate" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageDailyAggregate_pkey" PRIMARY KEY ("subscriptionId", "bucketDate")
);

CREATE INDEX "UsageRecord_subscriptionId_aggregatedAt_occurredAt_idx" ON "UsageRecord"("subscriptionId", "aggregatedAt", "occurredAt");
CREATE INDEX "UsageDailyAggregate_subscriptionId_bucketDate_idx" ON "UsageDailyAggregate"("subscriptionId", "bucketDate");

ALTER TABLE "UsageDailyAggregate"
ADD CONSTRAINT "UsageDailyAggregate_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "UsageDailyAggregate" (
    "subscriptionId",
    "bucketDate",
    "requestCount",
    "createdAt",
    "updatedAt"
)
SELECT
    "subscriptionId",
    date_trunc('day', "occurredAt") AS "bucketDate",
    SUM("requestCount")::INTEGER AS "requestCount",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "UsageRecord"
GROUP BY
    "subscriptionId",
    date_trunc('day', "occurredAt");

UPDATE "UsageRecord"
SET "aggregatedAt" = CURRENT_TIMESTAMP
WHERE "aggregatedAt" IS NULL;
