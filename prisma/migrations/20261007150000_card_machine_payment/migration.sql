CREATE TABLE "CardMachine" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardMachine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardMachine_name_key" ON "CardMachine"("name");

ALTER TABLE "Payment"
  ADD COLUMN "cardMachineId" TEXT,
  ADD COLUMN "cardInstallments" INTEGER,
  ADD COLUMN "cardFeeRate" DECIMAL(5,2),
  ADD COLUMN "cardFeeAmount" DECIMAL(12,2),
  ADD COLUMN "cardNetAmount" DECIMAL(12,2);

CREATE INDEX "Payment_cardMachineId_idx" ON "Payment"("cardMachineId");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_cardMachineId_fkey"
  FOREIGN KEY ("cardMachineId") REFERENCES "CardMachine"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;