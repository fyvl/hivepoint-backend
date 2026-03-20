ALTER TABLE "Invoice"
ADD COLUMN "managedRetryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "managedNextRetryAt" TIMESTAMP(3),
ADD COLUMN "managedLastRetryAt" TIMESTAMP(3),
ADD COLUMN "managedRetryExhaustedAt" TIMESTAMP(3),
ADD COLUMN "managedLastRetryError" TEXT;

CREATE INDEX "Invoice_status_managedNextRetryAt_createdAt_idx"
ON "Invoice"("status", "managedNextRetryAt", "createdAt");
