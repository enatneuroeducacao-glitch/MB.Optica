ALTER TABLE "AccountSettlement"
ADD COLUMN "cardMachineId" TEXT,
ADD COLUMN "cardInstallments" INTEGER,
ADD COLUMN "cardFeeRate" DECIMAL(5,2),
ADD COLUMN "cardFeeAmount" DECIMAL(12,2),
ADD COLUMN "cardNetAmount" DECIMAL(12,2);

ALTER TABLE "AccountSettlement"
ADD CONSTRAINT "AccountSettlement_cardMachineId_fkey"
FOREIGN KEY ("cardMachineId") REFERENCES "CardMachine"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
