CREATE TABLE "BackgroundJobLease" (
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJobLease_pkey" PRIMARY KEY ("name")
);

CREATE INDEX "BackgroundJobLease_expiresAt_idx" ON "BackgroundJobLease"("expiresAt");
