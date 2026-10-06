CREATE TABLE "PayrollSettings" (
  "id" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL DEFAULT 'Moni Becker',
  "ownerRole" TEXT NOT NULL DEFAULT 'Proprietária / Administradora',
  "recommendationMode" TEXT NOT NULL DEFAULT 'MEDIA_6_MESES',
  "reservePercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
  "salaryRules" JSONB NOT NULL,
  "taxRules" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollRecord" (
  "id" TEXT NOT NULL,
  "competence" TIMESTAMP(3) NOT NULL,
  "personName" TEXT NOT NULL,
  "role" TEXT,
  "type" TEXT NOT NULL DEFAULT 'PROLABORE',
  "grossAmount" DECIMAL(12,2) NOT NULL,
  "inssAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "irrfAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "otherDiscounts" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netAmount" DECIMAL(12,2) NOT NULL,
  "employerInss" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "fgtsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
  "paymentDate" TIMESTAMP(3),
  "notes" TEXT,
  "ruleSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollRecord_competence_idx" ON "PayrollRecord"("competence");
CREATE INDEX "PayrollRecord_personName_competence_idx" ON "PayrollRecord"("personName","competence");
CREATE INDEX "PayrollRecord_status_idx" ON "PayrollRecord"("status");