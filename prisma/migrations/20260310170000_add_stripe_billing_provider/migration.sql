-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('MOCK', 'STRIPE');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "paymentProvider" "BillingProvider" NOT NULL DEFAULT 'MOCK',
ADD COLUMN "externalSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "Invoice"
ADD COLUMN "paymentProvider" "BillingProvider" NOT NULL DEFAULT 'MOCK',
ADD COLUMN "externalCheckoutSessionId" TEXT,
ADD COLUMN "externalInvoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_externalSubscriptionId_key" ON "Subscription"("externalSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_externalCheckoutSessionId_key" ON "Invoice"("externalCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_externalInvoiceId_key" ON "Invoice"("externalInvoiceId");
