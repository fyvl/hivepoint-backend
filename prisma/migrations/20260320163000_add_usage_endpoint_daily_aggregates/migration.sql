CREATE TABLE "UsageEndpointDailyAggregate" (
    "subscriptionId" TEXT NOT NULL,
    "bucketDate" TIMESTAMP(3) NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageEndpointDailyAggregate_pkey" PRIMARY KEY ("subscriptionId","bucketDate","endpoint")
);

CREATE INDEX "UsageEndpointDailyAggregate_subscriptionId_bucketDate_idx"
ON "UsageEndpointDailyAggregate"("subscriptionId", "bucketDate");

CREATE INDEX "UsageEndpointDailyAggregate_subscriptionId_endpoint_bucketDate_idx"
ON "UsageEndpointDailyAggregate"("subscriptionId", "endpoint", "bucketDate");

ALTER TABLE "UsageEndpointDailyAggregate"
ADD CONSTRAINT "UsageEndpointDailyAggregate_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
