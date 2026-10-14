ALTER TABLE "AccountingMapping"
ADD COLUMN "paymentMethodId" TEXT;

ALTER TABLE "AccountingMapping"
DROP CONSTRAINT IF EXISTS "AccountingMapping_eventType_debitAccountId_creditAccountId_key";

CREATE UNIQUE INDEX "AccountingMapping_eventType_paymentMethodId_debitAccountId_creditAccountId_key"
ON "AccountingMapping"("eventType", "paymentMethodId", "debitAccountId", "creditAccountId");

CREATE INDEX "AccountingMapping_eventType_paymentMethodId_active_idx"
ON "AccountingMapping"("eventType", "paymentMethodId", "active");

ALTER TABLE "AccountingMapping"
ADD CONSTRAINT "AccountingMapping_paymentMethodId_fkey"
FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;