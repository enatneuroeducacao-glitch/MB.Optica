ALTER TABLE "Payment" ADD COLUMN "accountSettlementId" TEXT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountSettlementId_key" UNIQUE ("accountSettlementId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountSettlementId_fkey" FOREIGN KEY ("accountSettlementId") REFERENCES "AccountSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountSettlement" ADD COLUMN "reversedAt" TIMESTAMP(3);