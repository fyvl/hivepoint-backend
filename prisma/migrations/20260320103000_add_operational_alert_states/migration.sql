CREATE TABLE "OperationalAlertState" (
    "kind" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "firstObservedAt" TIMESTAMP(3) NOT NULL,
    "lastObservedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "lastDeliveredAt" TIMESTAMP(3),
    "lastDeliveryAttemptAt" TIMESTAMP(3),
    "deliveryCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryFailures" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAlertState_pkey" PRIMARY KEY ("kind")
);

CREATE INDEX "OperationalAlertState_resolvedAt_updatedAt_idx"
    ON "OperationalAlertState"("resolvedAt", "updatedAt");

CREATE INDEX "OperationalAlertState_updatedAt_idx"
    ON "OperationalAlertState"("updatedAt");
