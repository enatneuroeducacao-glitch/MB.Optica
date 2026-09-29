-- MB Óptica Prisma baseline
-- Generated from prisma/schema.prisma. The existing production database is baselined with this migration marked as applied.

CREATE TYPE "public"."UserRole" AS ENUM ('ADMIN', 'GERENTE', 'VENDEDOR', 'LABORATORIO', 'FINANCEIRO');
CREATE TYPE "public"."OrderStatus" AS ENUM ('ORCAMENTO', 'APROVADO', 'PEDIDO', 'AGUARDANDO_LABORATORIO', 'EM_PRODUCAO', 'RECEBIDO', 'CONFERENCIA', 'RETORNO_GARANTIA', 'PRONTO', 'ENTREGUE', 'CANCELADO', 'DEVOLVIDO');
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADO');
CREATE TYPE "public"."AccountType" AS ENUM ('RECEBER', 'PAGAR');
CREATE TYPE "public"."StockMovementType" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE', 'TRANSFERENCIA', 'DEVOLUCAO');
CREATE TYPE "public"."FiscalDocumentType" AS ENUM ('NFC_E', 'NF_E', 'NFA_E', 'NFS_E');
CREATE TYPE "public"."FiscalDocumentStatus" AS ENUM ('PENDENTE', 'AUTORIZADO', 'REJEITADO', 'CANCELADO', 'INUTILIZADO', 'CONTINGENCIA');
CREATE TYPE "public"."FiscalIntegrationMode" AS ENUM ('NFF', 'NFAE_SAT', 'PAF_NFCE', 'MANUAL');

CREATE SEQUENCE "public"."Quote_number_seq";
CREATE SEQUENCE "public"."OpticalOrder_number_seq";
CREATE SEQUENCE "public"."Sale_number_seq";

CREATE TABLE "public"."FiscalConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "legalName" TEXT,
  "tradeName" TEXT,
  "cnpj" TEXT,
  "stateRegistration" TEXT,
  "municipalRegistration" TEXT,
  "uf" TEXT NOT NULL DEFAULT 'SC',
  "city" TEXT,
  "taxRegime" TEXT NOT NULL DEFAULT 'SIMEI',
  "integrationMode" "FiscalIntegrationMode" NOT NULL DEFAULT 'NFF',
  "series" TEXT,
  "environment" TEXT NOT NULL DEFAULT 'HOMOLOGACAO',
  "secretReference" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "public"."FiscalDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" "FiscalDocumentType" NOT NULL,
  "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDENTE',
  "number" TEXT,
  "series" TEXT,
  "accessKey" TEXT,
  "protocol" TEXT,
  "issueDate" TIMESTAMP(3),
  "authorizationDate" TIMESTAMP(3),
  "cancellationDate" TIMESTAMP(3),
  "total" DECIMAL(12,2) NOT NULL,
  "customerName" TEXT,
  "customerDocument" TEXT,
  "xml" TEXT,
  "danfeUrl" TEXT,
  "qrCodeUrl" TEXT,
  "rejectionCode" TEXT,
  "rejectionMessage" TEXT,
  "notes" TEXT,
  "configId" TEXT,
  "saleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "public"."User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'VENDEDOR',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "passwordHash" TEXT,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "lastLoginAt" TIMESTAMP(3),
  "permissions" JSONB
);
CREATE TABLE "public"."Customer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "cpfCnpj" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "birthDate" TIMESTAMP(3),
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "public"."Address" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "label" TEXT,
  "street" TEXT,
  "number" TEXT,
  "complement" TEXT,
  "district" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT
);
CREATE TABLE "public"."Prescription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "professional" TEXT,
  "validUntil" TIMESTAMP(3),
  "odSphere" DECIMAL(6,2),
  "odCylinder" DECIMAL(6,2),
  "odAxis" DECIMAL(6,2),
  "odAdd" DECIMAL(6,2),
  "odPrism" DECIMAL(6,2),
  "odBase" TEXT,
  "odDnp" DECIMAL(6,2),
  "odHeight" DECIMAL(6,2),
  "oeSphere" DECIMAL(6,2),
  "oeCylinder" DECIMAL(6,2),
  "oeAxis" DECIMAL(6,2),
  "oeAdd" DECIMAL(6,2),
  "oePrism" DECIMAL(6,2),
  "oeBase" TEXT,
  "oeDnp" DECIMAL(6,2),
  "oeHeight" DECIMAL(6,2),
  "pdTotal" DECIMAL(6,2),
  "notes" TEXT,
  "originalText" TEXT
);
CREATE TABLE "public"."Category" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "public"."Supplier" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "public"."Product" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ncm" TEXT,
  "cest" TEXT,
  "cfop" TEXT,
  "origin" TEXT,
  "taxCode" TEXT,
  "code" TEXT NOT NULL,
  "barcode" TEXT,
  "description" TEXT NOT NULL,
  "brand" TEXT,
  "model" TEXT,
  "color" TEXT,
  "frameSize" TEXT,
  "lensWidth" INTEGER,
  "bridgeWidth" INTEGER,
  "templeLength" INTEGER,
  "material" TEXT,
  "frameShape" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'UN',
  "cost" DECIMAL(12,2) NOT NULL,
  "salePrice" DECIMAL(12,2) NOT NULL,
  "minimumStock" DECIMAL(12,3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "categoryId" TEXT,
  "supplierId" TEXT
);
CREATE TABLE "public"."StockLot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "quantity" DECIMAL(12,3) NOT NULL,
  "cost" DECIMAL(12,2),
  "expiresAt" TIMESTAMP(3),
  "archived" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "public"."StockMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitCost" DECIMAL(12,2),
  "reference" TEXT,
  "referenceId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "public"."StockMovementLot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movementId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL
);
CREATE TABLE "public"."Quote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" INTEGER NOT NULL DEFAULT nextval('"Quote_number_seq"'::regclass),
  "customerId" TEXT NOT NULL,
  "prescriptionId" TEXT,
  "sellerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ABERTO',
  "validUntil" TIMESTAMP(3),
  "deliveryDate" TIMESTAMP(3),
  "discount" DECIMAL(12,2) NOT NULL,
  "surcharge" DECIMAL(12,2) NOT NULL,
  "entryAmount" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "paymentMethod" TEXT,
  "installments" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "public"."QuoteItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "quoteId" TEXT NOT NULL,
  "productId" TEXT,
  "description" TEXT NOT NULL,
  "kind" TEXT,
  "eye" TEXT,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL
);
CREATE TABLE "public"."OpticalOrder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" INTEGER NOT NULL DEFAULT nextval('"OpticalOrder_number_seq"'::regclass),
  "customerId" TEXT NOT NULL,
  "prescriptionId" TEXT,
  "sellerId" TEXT,
  "status" "OrderStatus" NOT NULL DEFAULT 'ORCAMENTO',
  "dueDate" TIMESTAMP(3),
  "laboratory" TEXT,
  "laboratorySentAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "notes" TEXT,
  "total" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "quoteId" TEXT
);
CREATE TABLE "public"."OpticalOrderItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  "description" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "eye" TEXT,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL
);
CREATE TABLE "public"."OrderEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "public"."Sale" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" INTEGER NOT NULL DEFAULT nextval('"Sale_number_seq"'::regclass),
  "customerId" TEXT,
  "sellerId" TEXT NOT NULL,
  "orderId" TEXT,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL,
  "surcharge" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "notes" TEXT,
  "paymentCondition" TEXT,
  "installments" INTEGER,
  "pixPayload" TEXT,
  "canceled" BOOLEAN NOT NULL DEFAULT false,
  "canceledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "public"."SaleItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "saleId" TEXT NOT NULL,
  "productId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL
);
CREATE TABLE "public"."PaymentMethod" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isCash" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "public"."PixKey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "holderName" TEXT NOT NULL,
  "holderDocument" TEXT,
  "city" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "public"."Payment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "saleId" TEXT NOT NULL,
  "methodId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reference" TEXT,
  "reversedAt" TIMESTAMP(3),
  "reversalReference" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "public"."Account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" "AccountType" NOT NULL,
  "description" TEXT NOT NULL,
  "customerId" TEXT,
  "supplierId" TEXT,
  "saleId" TEXT,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paidAmount" DECIMAL(12,2) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDENTE',
  "notes" TEXT
);
CREATE TABLE "public"."AccountSettlement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" TEXT,
  "methodId" TEXT,
  "reference" TEXT,
  "notes" TEXT
);
CREATE TABLE "public"."CashSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "openingCash" DECIMAL(12,2) NOT NULL,
  "closingCash" DECIMAL(12,2),
  "notes" TEXT
);
CREATE TABLE "public"."CashMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "description" TEXT NOT NULL,
  "referenceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "public"."AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "public"."MigrationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "total" INTEGER NOT NULL,
  "imported" INTEGER NOT NULL DEFAULT 0,
  "mapped" INTEGER NOT NULL DEFAULT 0,
  "warnings" INTEGER NOT NULL DEFAULT 0,
  "errors" INTEGER NOT NULL DEFAULT 0,
  "report" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE TABLE "public"."LegacyRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL DEFAULT 'BEEPSTART',
  "collectionKey" TEXT,
  "legacyId" TEXT,
  "legacyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "customerId" TEXT,
  "migrationRunId" TEXT,
  "targetEntity" TEXT,
  "targetId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PRESERVED',
  "errorMessage" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "public"."StoreSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "legalName" TEXT,
  "tradeName" TEXT NOT NULL DEFAULT 'MB Óptica',
  "logoData" TEXT,
  "document" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "street" TEXT,
  "number" TEXT,
  "complement" TEXT,
  "district" TEXT,
  "city" TEXT,
  "state" TEXT DEFAULT 'SC',
  "postalCode" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "public"."Appointment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "professionalType" TEXT NOT NULL,
  "professionalName" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AGENDADO',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "public"."ServiceOrderSequence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "FiscalDocument_saleId_key" ON "public"."FiscalDocument" ("saleId");
CREATE INDEX "FiscalDocument_status_idx" ON "public"."FiscalDocument" ("status");
CREATE INDEX "FiscalDocument_accessKey_idx" ON "public"."FiscalDocument" ("accessKey");
CREATE UNIQUE INDEX "User_email_key" ON "public"."User" ("email");
CREATE UNIQUE INDEX "Customer_cpfCnpj_key" ON "public"."Customer" ("cpfCnpj");
CREATE UNIQUE INDEX "Category_name_key" ON "public"."Category" ("name");
CREATE UNIQUE INDEX "Product_code_key" ON "public"."Product" ("code");
CREATE UNIQUE INDEX "Product_barcode_key" ON "public"."Product" ("barcode");
CREATE UNIQUE INDEX "StockMovementLot_movementId_lotId_key" ON "public"."StockMovementLot" ("movementId", "lotId");
CREATE INDEX "StockMovementLot_lotId_idx" ON "public"."StockMovementLot" ("lotId");
CREATE UNIQUE INDEX "Quote_number_key" ON "public"."Quote" ("number");
CREATE INDEX "Quote_status_idx" ON "public"."Quote" ("status");
CREATE INDEX "Quote_customerId_createdAt_idx" ON "public"."Quote" ("customerId", "createdAt");
CREATE UNIQUE INDEX "OpticalOrder_number_key" ON "public"."OpticalOrder" ("number");
CREATE UNIQUE INDEX "OpticalOrder_quoteId_key" ON "public"."OpticalOrder" ("quoteId");
CREATE UNIQUE INDEX "Sale_number_key" ON "public"."Sale" ("number");
CREATE UNIQUE INDEX "Sale_orderId_key" ON "public"."Sale" ("orderId");
CREATE UNIQUE INDEX "PaymentMethod_name_key" ON "public"."PaymentMethod" ("name");
CREATE UNIQUE INDEX "PixKey_key_key" ON "public"."PixKey" ("key");
CREATE INDEX "AccountSettlement_accountId_paidAt_idx" ON "public"."AccountSettlement" ("accountId", "paidAt");
CREATE UNIQUE INDEX "MigrationRun_sourceFingerprint_key" ON "public"."MigrationRun" ("sourceFingerprint");
CREATE UNIQUE INDEX "LegacyRecord_legacyKey_key" ON "public"."LegacyRecord" ("legacyKey");
CREATE INDEX "LegacyRecord_collectionKey_idx" ON "public"."LegacyRecord" ("collectionKey");
CREATE INDEX "LegacyRecord_legacyId_idx" ON "public"."LegacyRecord" ("legacyId");
CREATE INDEX "LegacyRecord_migrationRunId_idx" ON "public"."LegacyRecord" ("migrationRunId");
CREATE INDEX "LegacyRecord_targetEntity_targetId_idx" ON "public"."LegacyRecord" ("targetEntity", "targetId");
CREATE INDEX "Appointment_scheduledAt_idx" ON "public"."Appointment" ("scheduledAt");
CREATE INDEX "Appointment_customerId_scheduledAt_idx" ON "public"."Appointment" ("customerId", "scheduledAt");

ALTER TABLE "public"."FiscalDocument" ADD CONSTRAINT "FiscalDocument_configId_fkey" FOREIGN KEY ("configId") REFERENCES "public"."FiscalConfig" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."FiscalDocument" ADD CONSTRAINT "FiscalDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."Prescription" ADD CONSTRAINT "Prescription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."StockLot" ADD CONSTRAINT "StockLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "public"."StockMovementLot" ADD CONSTRAINT "StockMovementLot_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "public"."StockMovement" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."StockMovementLot" ADD CONSTRAINT "StockMovementLot_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "public"."StockLot" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "public"."Prescription" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."User" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "public"."Quote" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."OpticalOrder" ADD CONSTRAINT "OpticalOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "public"."OpticalOrder" ADD CONSTRAINT "OpticalOrder_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "public"."Prescription" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."OpticalOrder" ADD CONSTRAINT "OpticalOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."User" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."OpticalOrder" ADD CONSTRAINT "OpticalOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "public"."Quote" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."OpticalOrderItem" ADD CONSTRAINT "OpticalOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."OpticalOrder" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."OpticalOrderItem" ADD CONSTRAINT "OpticalOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."OpticalOrder" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."User" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."OpticalOrder" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "public"."PaymentMethod" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."AccountSettlement" ADD CONSTRAINT "AccountSettlement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."AccountSettlement" ADD CONSTRAINT "AccountSettlement_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "public"."PaymentMethod" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."CashMovement" ADD CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."CashSession" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."LegacyRecord" ADD CONSTRAINT "LegacyRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."LegacyRecord" ADD CONSTRAINT "LegacyRecord_migrationRunId_fkey" FOREIGN KEY ("migrationRunId") REFERENCES "public"."MigrationRun" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER SEQUENCE "public"."Quote_number_seq" OWNED BY "public"."Quote"."number";
ALTER SEQUENCE "public"."OpticalOrder_number_seq" OWNED BY "public"."OpticalOrder"."number";
ALTER SEQUENCE "public"."Sale_number_seq" OWNED BY "public"."Sale"."number";
