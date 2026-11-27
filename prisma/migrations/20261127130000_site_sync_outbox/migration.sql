CREATE TABLE "SiteSyncOutbox" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'PRODUCT_STOCK',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteSyncOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteSyncOutbox_status_nextAttemptAt_idx"
ON "SiteSyncOutbox"("status", "nextAttemptAt");

CREATE INDEX "SiteSyncOutbox_productId_status_idx"
ON "SiteSyncOutbox"("productId", "status");
