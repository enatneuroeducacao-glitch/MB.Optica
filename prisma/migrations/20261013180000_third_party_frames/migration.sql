CREATE TABLE "ThirdPartyFrameIntake" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerId" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MARKETPLACE',
    "purchaseDate" TIMESTAMP(3),
    "condition" TEXT NOT NULL,
    "risks" TEXT,
    "serviceRequested" TEXT NOT NULL,
    "inspectionNotes" TEXT,
    "photoReferences" TEXT,
    "customerAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "servicePrice" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'RECEBIDA',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ThirdPartyFrameIntake_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ThirdPartyFrameIntake_status_createdAt_idx" ON "ThirdPartyFrameIntake"("status", "createdAt");
CREATE INDEX "ThirdPartyFrameIntake_customerId_idx" ON "ThirdPartyFrameIntake"("customerId");
ALTER TABLE "ThirdPartyFrameIntake" ADD CONSTRAINT "ThirdPartyFrameIntake_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
