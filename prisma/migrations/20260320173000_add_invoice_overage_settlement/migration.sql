CREATE TYPE "InvoiceKind" AS ENUM ('SUBSCRIPTION', 'OVERAGE');

ALTER TABLE "Invoice"
ADD COLUMN "kind" "InvoiceKind" NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN "overageSourceInvoiceId" TEXT,
ADD COLUMN "overageProcessedAt" TIMESTAMP(3),
ADD COLUMN "overageRequests" INTEGER,
ADD COLUMN "overageUnits" INTEGER;

CREATE UNIQUE INDEX "Invoice_overageSourceInvoiceId_key" ON "Invoice"("overageSourceInvoiceId");
CREATE INDEX "Invoice_kind_status_periodEnd_overageProcessedAt_idx" ON "Invoice"("kind", "status", "periodEnd", "overageProcessedAt");

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_overageSourceInvoiceId_fkey"
FOREIGN KEY ("overageSourceInvoiceId") REFERENCES "Invoice"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
