CREATE TABLE "OperationalAlertDeliveryTargetState" (
    "alertKind" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "lastDeliveredAt" TIMESTAMP(3),
    "lastDeliveryAttemptAt" TIMESTAMP(3),
    "deliveryCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryFailures" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAlertDeliveryTargetState_pkey" PRIMARY KEY ("alertKind","targetKey")
);

CREATE INDEX "OperationalAlertDeliveryTargetState_resolvedAt_updatedAt_idx"
ON "OperationalAlertDeliveryTargetState"("resolvedAt", "updatedAt");

CREATE INDEX "OperationalAlertDeliveryTargetState_updatedAt_idx"
ON "OperationalAlertDeliveryTargetState"("updatedAt");

CREATE TABLE "OperationalMetricsHistoryPoint" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageIngestPendingJobs" INTEGER NOT NULL,
    "usageIngestFailedJobs" INTEGER NOT NULL,
    "usageIngestOldestPendingAgeSeconds" INTEGER NOT NULL,
    "usageIngestLeasePresent" BOOLEAN NOT NULL,
    "usageIngestLeaseSecondsUntilExpiry" INTEGER NOT NULL,
    "billingReconciliationLeasePresent" BOOLEAN NOT NULL,
    "billingReconciliationLeaseSecondsUntilExpiry" INTEGER NOT NULL,
    "billingOverageCollectionLeasePresent" BOOLEAN NOT NULL,
    "billingOverageCollectionLeaseSecondsUntilExpiry" INTEGER NOT NULL,
    "subscriptionsPastDue" INTEGER NOT NULL,
    "auditLogsLast24h" INTEGER NOT NULL,

    CONSTRAINT "OperationalMetricsHistoryPoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalMetricsHistoryPoint_capturedAt_idx"
ON "OperationalMetricsHistoryPoint"("capturedAt");
