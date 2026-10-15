-- The initial migration created this uniqueness rule as an INDEX, not a table CONSTRAINT.
-- Therefore DROP CONSTRAINT in the payment-method migration did not remove it.
-- It incorrectly blocks a second payment-method mapping with the same event and accounts.
DROP INDEX IF EXISTS "AccountingMapping_eventType_debitAccountId_creditAccountId_key";

-- Preserve the intended uniqueness rule: same event + payment method + debit + credit.
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingMapping_eventType_paymentMethodId_debitAccountId_creditAccountId_key"
ON "AccountingMapping"("eventType", "paymentMethodId", "debitAccountId", "creditAccountId");
