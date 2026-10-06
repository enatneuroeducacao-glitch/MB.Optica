CREATE TYPE "SubscriptionPlan" AS ENUM ('BASICO', 'PROFISSIONAL', 'ENTERPRISE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('AVALIACAO', 'ATIVA', 'PENDENTE', 'SUSPENSA', 'CANCELADA', 'EXPIRADA');
CREATE TYPE "BillingCycle" AS ENUM ('MENSAL', 'ANUAL');

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'PROFISSIONAL',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'AVALIACAO',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MENSAL',
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "modules" JSONB,
    "provider" TEXT,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");
