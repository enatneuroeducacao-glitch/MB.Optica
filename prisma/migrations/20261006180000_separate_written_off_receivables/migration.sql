ALTER TABLE "Account" ADD COLUMN "writtenOffAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN "writtenOffReason" TEXT;
CREATE INDEX "Account_writtenOffAt_idx" ON "Account"("writtenOffAt");
