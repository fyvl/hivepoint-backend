CREATE TABLE "GatewayBurstBucket" (
    "key" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "lastRefillAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatewayBurstBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "GatewayBurstBucket_updatedAt_idx"
    ON "GatewayBurstBucket"("updatedAt");
