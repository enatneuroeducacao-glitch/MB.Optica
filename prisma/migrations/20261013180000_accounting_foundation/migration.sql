-- Additive foundation for the accounting module. No existing operational tables are changed.
CREATE TABLE "AccountingSettings" (
  "id" TEXT NOT NULL,
  "taxRegime" TEXT NOT NULL DEFAULT 'SIMPLES_NACIONAL',
  "accountingStartDate" TIMESTAMP(3),
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChartOfAccount" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "nature" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "parentId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "system" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingPeriod" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ABERTO',
  "closedAt" TIMESTAMP(3),
  "closedByUserId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingEntry" (
  "id" TEXT NOT NULL,
  "entryDate" TIMESTAMP(3) NOT NULL,
  "competenceDate" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceId" TEXT,
  "originKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
  "totalDebit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalCredit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "periodId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "postedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "reversalOfId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingEntryLine" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "description" TEXT,
  "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingEntryLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingMapping" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "debitAccountId" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "processedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "entryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChartOfAccount_code_key" ON "ChartOfAccount"("code");
CREATE INDEX "ChartOfAccount_parentId_idx" ON "ChartOfAccount"("parentId");
CREATE INDEX "ChartOfAccount_active_nature_idx" ON "ChartOfAccount"("active", "nature");
CREATE UNIQUE INDEX "AccountingPeriod_year_month_key" ON "AccountingPeriod"("year", "month");
CREATE INDEX "AccountingPeriod_status_startDate_endDate_idx" ON "AccountingPeriod"("status", "startDate", "endDate");
CREATE UNIQUE INDEX "AccountingEntry_originKey_key" ON "AccountingEntry"("originKey");
CREATE INDEX "AccountingEntry_entryDate_idx" ON "AccountingEntry"("entryDate");
CREATE INDEX "AccountingEntry_competenceDate_idx" ON "AccountingEntry"("competenceDate");
CREATE INDEX "AccountingEntry_periodId_status_idx" ON "AccountingEntry"("periodId", "status");
CREATE INDEX "AccountingEntry_sourceType_sourceId_idx" ON "AccountingEntry"("sourceType", "sourceId");
CREATE UNIQUE INDEX "AccountingEntryLine_entryId_lineNumber_key" ON "AccountingEntryLine"("entryId", "lineNumber");
CREATE INDEX "AccountingEntryLine_accountId_createdAt_idx" ON "AccountingEntryLine"("accountId", "createdAt");
CREATE INDEX "AccountingEntryLine_referenceType_referenceId_idx" ON "AccountingEntryLine"("referenceType", "referenceId");
CREATE UNIQUE INDEX "AccountingMapping_eventType_debitAccountId_creditAccountId_key" ON "AccountingMapping"("eventType", "debitAccountId", "creditAccountId");
CREATE INDEX "AccountingMapping_eventType_active_idx" ON "AccountingMapping"("eventType", "active");
CREATE UNIQUE INDEX "AccountingEvent_idempotencyKey_key" ON "AccountingEvent"("idempotencyKey");
CREATE UNIQUE INDEX "AccountingEvent_entryId_key" ON "AccountingEvent"("entryId");
CREATE INDEX "AccountingEvent_eventType_status_idx" ON "AccountingEvent"("eventType", "status");
CREATE INDEX "AccountingEvent_sourceType_sourceId_idx" ON "AccountingEvent"("sourceType", "sourceId");

ALTER TABLE "ChartOfAccount"
  ADD CONSTRAINT "ChartOfAccount_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingEntry"
  ADD CONSTRAINT "AccountingEntry_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingEntryLine"
  ADD CONSTRAINT "AccountingEntryLine_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingEntryLine"
  ADD CONSTRAINT "AccountingEntryLine_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingMapping"
  ADD CONSTRAINT "AccountingMapping_debitAccountId_fkey"
  FOREIGN KEY ("debitAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingMapping"
  ADD CONSTRAINT "AccountingMapping_creditAccountId_fkey"
  FOREIGN KEY ("creditAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingEvent"
  ADD CONSTRAINT "AccountingEvent_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
