CREATE TABLE "FrameAdaptationOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "saleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "laboratory" TEXT,
    "oldFrameDescription" TEXT,
    "newFrameDescription" TEXT NOT NULL,
    "lensSource" TEXT NOT NULL DEFAULT 'CLIENTE',
    "prescriptionStatus" TEXT NOT NULL DEFAULT 'SEM_RECEITA',
    "lensType" TEXT,
    "lensDegreeInfo" TEXT,
    "serviceType" TEXT NOT NULL DEFAULT 'MONTAGEM_ADAPTACAO',
    "frameCondition" TEXT,
    "preexistingDamage" TEXT,
    "inspectionNotes" TEXT,
    "photoReferences" TEXT,
    "customerAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_ENVIO',
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FrameAdaptationOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FrameAdaptationOrder_number_key" ON "FrameAdaptationOrder"("number");
CREATE UNIQUE INDEX "FrameAdaptationOrder_saleId_key" ON "FrameAdaptationOrder"("saleId");
CREATE INDEX "FrameAdaptationOrder_status_createdAt_idx" ON "FrameAdaptationOrder"("status","createdAt");
CREATE INDEX "FrameAdaptationOrder_customerId_idx" ON "FrameAdaptationOrder"("customerId");
ALTER TABLE "FrameAdaptationOrder" ADD CONSTRAINT "FrameAdaptationOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FrameAdaptationOrder" ADD CONSTRAINT "FrameAdaptationOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FrameAdaptationOrder" ADD CONSTRAINT "FrameAdaptationOrder_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
