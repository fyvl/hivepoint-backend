ALTER TABLE "Plan"
    ADD COLUMN "allowOverage" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "overageUnitRequests" INTEGER,
    ADD COLUMN "overagePriceCents" INTEGER;
