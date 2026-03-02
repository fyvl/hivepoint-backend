-- AlterTable
ALTER TABLE "ApiVersion"
ADD COLUMN "openApiSnapshot" TEXT,
ADD COLUMN "openApiFetchedAt" TIMESTAMP(3);
