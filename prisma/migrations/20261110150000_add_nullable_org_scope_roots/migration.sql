-- Additive phase only: nullable organization scope on operational roots.
-- No backfill, NOT NULL constraint, foreign key, or uniqueness change is performed here.
-- Existing rows remain untouched until a separately reviewed tenant backfill.
ALTER TABLE "FiscalConfig" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Category" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Product" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Quote" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "OpticalOrder" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Account" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "CashSession" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AccountingSettings" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ChartOfAccount" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AccountingPeriod" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AccountingEntry" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AccountingMapping" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PayrollSettings" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "BirthdayReminder" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ServiceOrderSequence" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ThirdPartyFrameIntake" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "FrameAdaptationOrder" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "MigrationRun" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "LegacyRecord" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PaymentMethod" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "CardMachine" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PixKey" ADD COLUMN "organizationId" TEXT;
