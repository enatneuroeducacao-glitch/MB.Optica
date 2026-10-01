ALTER TABLE "FiscalConfig" ADD COLUMN "certificateType" TEXT;
ALTER TABLE "FiscalConfig" ADD COLUMN "certificateExpiresAt" TIMESTAMP(3);
ALTER TABLE "FiscalConfig" ADD COLUMN "certificateAuthority" TEXT;
ALTER TABLE "FiscalConfig" ADD COLUMN "certificateLastCheckedAt" TIMESTAMP(3);