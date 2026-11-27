-- Durable queue for optional synchronization of locally committed product stock.
CREATE TABLE "SiteSyncOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'PRODUCT_STOCK',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "SiteSyncOutbox_status_nextAttemptAt_idx"
ON "SiteSyncOutbox"("status", "nextAttemptAt");

CREATE INDEX "SiteSyncOutbox_productId_status_idx"
ON "SiteSyncOutbox"("productId", "status");
