-- CreateTable
CREATE TABLE "FiscalConfig" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "legalName" TEXT,
    "tradeName" TEXT,
    "cnpj" TEXT,
    "stateRegistration" TEXT,
    "municipalRegistration" TEXT,
    "uf" TEXT NOT NULL DEFAULT 'SC',
    "city" TEXT,
    "taxRegime" TEXT NOT NULL DEFAULT 'SIMEI',
    "integrationMode" TEXT NOT NULL DEFAULT 'NFF',
    "series" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGACAO',
    "secretReference" TEXT,
    "certificateType" TEXT,
    "certificateExpiresAt" DATETIME,
    "certificateAuthority" TEXT,
    "certificateLastCheckedAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "number" TEXT,
    "series" TEXT,
    "accessKey" TEXT,
    "protocol" TEXT,
    "issueDate" DATETIME,
    "authorizationDate" DATETIME,
    "cancellationDate" DATETIME,
    "total" DECIMAL NOT NULL DEFAULT 0,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FiscalDocument_configId_fkey" FOREIGN KEY ("configId") REFERENCES "FiscalConfig" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FiscalDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VENDEDOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlatformAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'PROFISSIONAL',
    "status" TEXT NOT NULL DEFAULT 'AVALIACAO',
    "billingCycle" TEXT NOT NULL DEFAULT 'MENSAL',
    "price" DECIMAL NOT NULL DEFAULT 0,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxUnits" INTEGER,
    "maxClients" INTEGER,
    "maxProducts" INTEGER,
    "maxSales" INTEGER,
    "maxOrders" INTEGER,
    "trialDays" INTEGER NOT NULL DEFAULT 60,
    "graceDays" INTEGER NOT NULL DEFAULT 5,
    "licenseType" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
    "modules" JSONB,
    "provider" TEXT,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "trialEndsAt" DATETIME,
    "currentPeriodStart" DATETIME,
    "currentPeriodEnd" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mbEmail" TEXT,
    "role" TEXT NOT NULL DEFAULT 'VENDEDOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" DATETIME,
    "permissions" JSONB
);

-- CreateTable
CREATE TABLE "MailMessageState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MailMessageState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MailContactPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MailContactPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "birthDate" DATETIME,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "label" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "professional" TEXT,
    "validUntil" DATETIME,
    "odSphere" DECIMAL,
    "odCylinder" DECIMAL,
    "odAxis" DECIMAL,
    "odAdd" DECIMAL,
    "odPrism" DECIMAL,
    "odBase" TEXT,
    "odDnp" DECIMAL,
    "odHeight" DECIMAL,
    "oeSphere" DECIMAL,
    "oeCylinder" DECIMAL,
    "oeAxis" DECIMAL,
    "oeAdd" DECIMAL,
    "oePrism" DECIMAL,
    "oeBase" TEXT,
    "oeDnp" DECIMAL,
    "oeHeight" DECIMAL,
    "pdTotal" DECIMAL,
    "notes" TEXT,
    "originalText" TEXT,
    CONSTRAINT "Prescription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Supplier" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Product" (
    "organizationId" TEXT,
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
    "photoData" TEXT,
    "publishedOnSite" BOOLEAN NOT NULL DEFAULT false,
    "siteCollectionSlug" TEXT,
    "siteFeatured" BOOLEAN NOT NULL DEFAULT false,
    "siteSortOrder" INTEGER NOT NULL DEFAULT 0,
    "siteDescription" TEXT,
    "sitePrice" DECIMAL,
    "siteProductId" TEXT,
    "siteSyncedAt" DATETIME,
    "siteSyncStatus" TEXT,
    "siteSyncError" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "cost" DECIMAL NOT NULL DEFAULT 0,
    "salePrice" DECIMAL NOT NULL DEFAULT 0,
    "minimumStock" DECIMAL NOT NULL DEFAULT 0,
    "stockControlled" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT,
    "supplierId" TEXT,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" DECIMAL NOT NULL,
    "cost" DECIMAL,
    "expiresAt" DATETIME,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "StockLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitCost" DECIMAL,
    "reference" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockMovementLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movementId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    CONSTRAINT "StockMovementLot_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockMovementLot_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "sellerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "validUntil" DATETIME,
    "deliveryDate" DATETIME,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "surcharge" DECIMAL NOT NULL DEFAULT 0,
    "entryAmount" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "installments" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quote_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quote_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "kind" TEXT,
    "eye" TEXT,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpticalOrder" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "sellerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ORCAMENTO',
    "dueDate" DATETIME,
    "laboratory" TEXT,
    "laboratorySentAt" DATETIME,
    "receivedAt" DATETIME,
    "deliveredAt" DATETIME,
    "notes" TEXT,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "quoteId" TEXT,
    CONSTRAINT "OpticalOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OpticalOrder_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OpticalOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OpticalOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpticalOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "eye" TEXT,
    "quantity" DECIMAL NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "OpticalOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OpticalOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpticalOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OpticalOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sale" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "customerId" TEXT,
    "sellerId" TEXT NOT NULL,
    "saleType" TEXT NOT NULL DEFAULT 'BALCAO',
    "orderId" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "surcharge" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "paymentCondition" TEXT,
    "installments" INTEGER,
    "pixPayload" TEXT,
    "canceled" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" DATETIME,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OpticalOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isCash" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "CardMachine" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PixKey" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderDocument" TEXT,
    "city" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reference" TEXT,
    "cardMachineId" TEXT,
    "cardInstallments" INTEGER,
    "cardFeeRate" DECIMAL,
    "cardFeeAmount" DECIMAL,
    "cardNetAmount" DECIMAL,
    "reversedAt" DATETIME,
    "reversalReference" TEXT,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountSettlementId" TEXT,
    CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_cardMachineId_fkey" FOREIGN KEY ("cardMachineId") REFERENCES "CardMachine" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_accountSettlementId_fkey" FOREIGN KEY ("accountSettlementId") REFERENCES "AccountSettlement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'OUTRA_OBRIGACAO',
    "description" TEXT NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "saleId" TEXT,
    "dueDate" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "notes" TEXT,
    "writtenOffAt" DATETIME,
    "writtenOffReason" TEXT,
    CONSTRAINT "Account_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "methodId" TEXT,
    "cardMachineId" TEXT,
    "cardInstallments" INTEGER,
    "cardFeeRate" DECIMAL,
    "cardFeeAmount" DECIMAL,
    "cardNetAmount" DECIMAL,
    "reference" TEXT,
    "notes" TEXT,
    "reversedAt" DATETIME,
    CONSTRAINT "AccountSettlement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountSettlement_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountSettlement_cardMachineId_fkey" FOREIGN KEY ("cardMachineId") REFERENCES "CardMachine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CashSession" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "openingCash" DECIMAL NOT NULL,
    "closingCash" DECIMAL,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MigrationRun" (
    "organizationId" TEXT,
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
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "LegacyRecord" (
    "organizationId" TEXT,
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
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegacyRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LegacyRecord_migrationRunId_fkey" FOREIGN KEY ("migrationRunId") REFERENCES "MigrationRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollSettings" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerName" TEXT NOT NULL DEFAULT 'Moni Becker',
    "ownerRole" TEXT NOT NULL DEFAULT 'Proprietária / Administradora',
    "recommendationMode" TEXT NOT NULL DEFAULT 'MEDIA_6_MESES',
    "reservePercent" DECIMAL NOT NULL DEFAULT 10,
    "salaryRules" JSONB NOT NULL,
    "taxRules" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competence" DATETIME NOT NULL,
    "personName" TEXT NOT NULL,
    "role" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PROLABORE',
    "grossAmount" DECIMAL NOT NULL,
    "inssAmount" DECIMAL NOT NULL DEFAULT 0,
    "irrfAmount" DECIMAL NOT NULL DEFAULT 0,
    "otherDiscounts" DECIMAL NOT NULL DEFAULT 0,
    "netAmount" DECIMAL NOT NULL,
    "employerInss" DECIMAL NOT NULL DEFAULT 0,
    "fgtsAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalCost" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "paymentDate" DATETIME,
    "notes" TEXT,
    "ruleSnapshot" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "organizationId" TEXT,
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
    "shiftStartTime" TEXT NOT NULL DEFAULT '09:00',
    "shiftEndTime" TEXT NOT NULL DEFAULT '18:00',
    "timeTrackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlySalesGoal" DECIMAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Appointment" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "professionalType" TEXT NOT NULL,
    "professionalName" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AGENDADO',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BirthdayReminder" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "birthDate" DATETIME NOT NULL,
    "customerId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BirthdayReminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceOrderSequence" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AccountingSettings" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "taxRegime" TEXT NOT NULL DEFAULT 'SIMPLES_NACIONAL',
    "accountingStartDate" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "nature" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChartOfAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "closedAt" DATETIME,
    "closedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AccountingEntry" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryDate" DATETIME NOT NULL,
    "competenceDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "originKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "totalDebit" DECIMAL NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL NOT NULL DEFAULT 0,
    "periodId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "postedAt" DATETIME,
    "reversedAt" DATETIME,
    "reversalOfId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingEntryLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountingEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingMapping" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "paymentMethodId" TEXT,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingMapping_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountingMapping_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "ChartOfAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountingMapping_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "ChartOfAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "processedAt" DATETIME,
    "errorMessage" TEXT,
    "entryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingEvent_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ThirdPartyFrameIntake" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT NOT NULL,
    "customerId" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MARKETPLACE',
    "purchaseDate" DATETIME,
    "condition" TEXT NOT NULL,
    "risks" TEXT,
    "serviceRequested" TEXT NOT NULL,
    "inspectionNotes" TEXT,
    "photoReferences" TEXT,
    "customerAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "servicePrice" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'RECEBIDA',
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThirdPartyFrameIntake_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FrameAdaptationOrder" (
    "organizationId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "saleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "laboratory" TEXT,
    "oldFrameDescription" TEXT,
    "newFrameDescription" TEXT NOT NULL,
    "lensSource" TEXT NOT NULL DEFAULT 'CLIENTE',
    "prescriptionStatus" TEXT NOT NULL DEFAULT 'SEM_RECEITA',
    "lensType" TEXT,
    "lensDegreeInfo" TEXT,
    "serviceType" TEXT NOT NULL DEFAULT 'MONTAGEM_ADAPTACAO',
    "frameCondition" TEXT,
    "preexistingDamage" TEXT,
    "inspectionNotes" TEXT,
    "photoReferences" TEXT,
    "customerAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_ENVIO',
    "dueDate" DATETIME,
    "sentAt" DATETIME,
    "receivedAt" DATETIME,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FrameAdaptationOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FrameAdaptationOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FrameAdaptationOrder_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_saleId_key" ON "FiscalDocument"("saleId");

-- CreateIndex
CREATE INDEX "FiscalDocument_status_idx" ON "FiscalDocument"("status");

-- CreateIndex
CREATE INDEX "FiscalDocument_accessKey_idx" ON "FiscalDocument"("accessKey");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_createdAt_idx" ON "Organization"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_active_idx" ON "OrganizationMembership"("userId", "active");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_role_active_idx" ON "OrganizationMembership"("organizationId", "role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAccess_userId_key" ON "PlatformAccess"("userId");

-- CreateIndex
CREATE INDEX "PlatformAccess_role_active_idx" ON "PlatformAccess"("role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_mbEmail_key" ON "User"("mbEmail");

-- CreateIndex
CREATE INDEX "MailMessageState_userId_archived_deleted_idx" ON "MailMessageState"("userId", "archived", "deleted");

-- CreateIndex
CREATE UNIQUE INDEX "MailMessageState_userId_messageId_key" ON "MailMessageState"("userId", "messageId");

-- CreateIndex
CREATE INDEX "MailContactPreference_userId_contactType_hidden_idx" ON "MailContactPreference"("userId", "contactType", "hidden");

-- CreateIndex
CREATE UNIQUE INDEX "MailContactPreference_userId_email_key" ON "MailContactPreference"("userId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_cpfCnpj_key" ON "Customer"("cpfCnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "StockMovementLot_lotId_idx" ON "StockMovementLot"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovementLot_movementId_lotId_key" ON "StockMovementLot"("movementId", "lotId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_customerId_createdAt_idx" ON "Quote"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpticalOrder_number_key" ON "OpticalOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "OpticalOrder_quoteId_key" ON "OpticalOrder"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_number_key" ON "Sale"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_orderId_key" ON "Sale"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_name_key" ON "PaymentMethod"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CardMachine_name_key" ON "CardMachine"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PixKey_key_key" ON "PixKey"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_accountSettlementId_key" ON "Payment"("accountSettlementId");

-- CreateIndex
CREATE INDEX "AccountSettlement_accountId_paidAt_idx" ON "AccountSettlement"("accountId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationRun_sourceFingerprint_key" ON "MigrationRun"("sourceFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyRecord_legacyKey_key" ON "LegacyRecord"("legacyKey");

-- CreateIndex
CREATE INDEX "LegacyRecord_collectionKey_idx" ON "LegacyRecord"("collectionKey");

-- CreateIndex
CREATE INDEX "LegacyRecord_legacyId_idx" ON "LegacyRecord"("legacyId");

-- CreateIndex
CREATE INDEX "LegacyRecord_migrationRunId_idx" ON "LegacyRecord"("migrationRunId");

-- CreateIndex
CREATE INDEX "LegacyRecord_targetEntity_targetId_idx" ON "LegacyRecord"("targetEntity", "targetId");

-- CreateIndex
CREATE INDEX "PayrollRecord_competence_idx" ON "PayrollRecord"("competence");

-- CreateIndex
CREATE INDEX "PayrollRecord_personName_competence_idx" ON "PayrollRecord"("personName", "competence");

-- CreateIndex
CREATE INDEX "PayrollRecord_status_idx" ON "PayrollRecord"("status");

-- CreateIndex
CREATE INDEX "Appointment_scheduledAt_idx" ON "Appointment"("scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_customerId_scheduledAt_idx" ON "Appointment"("customerId", "scheduledAt");

-- CreateIndex
CREATE INDEX "BirthdayReminder_birthDate_idx" ON "BirthdayReminder"("birthDate");

-- CreateIndex
CREATE INDEX "BirthdayReminder_customerId_idx" ON "BirthdayReminder"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_code_key" ON "ChartOfAccount"("code");

-- CreateIndex
CREATE INDEX "ChartOfAccount_parentId_idx" ON "ChartOfAccount"("parentId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_active_nature_idx" ON "ChartOfAccount"("active", "nature");

-- CreateIndex
CREATE INDEX "AccountingPeriod_status_startDate_endDate_idx" ON "AccountingPeriod"("status", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_year_month_key" ON "AccountingPeriod"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntry_originKey_key" ON "AccountingEntry"("originKey");

-- CreateIndex
CREATE INDEX "AccountingEntry_entryDate_idx" ON "AccountingEntry"("entryDate");

-- CreateIndex
CREATE INDEX "AccountingEntry_competenceDate_idx" ON "AccountingEntry"("competenceDate");

-- CreateIndex
CREATE INDEX "AccountingEntry_periodId_status_idx" ON "AccountingEntry"("periodId", "status");

-- CreateIndex
CREATE INDEX "AccountingEntry_sourceType_sourceId_idx" ON "AccountingEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "AccountingEntryLine_accountId_createdAt_idx" ON "AccountingEntryLine"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountingEntryLine_referenceType_referenceId_idx" ON "AccountingEntryLine"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntryLine_entryId_lineNumber_key" ON "AccountingEntryLine"("entryId", "lineNumber");

-- CreateIndex
CREATE INDEX "AccountingMapping_eventType_paymentMethodId_active_idx" ON "AccountingMapping"("eventType", "paymentMethodId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingMapping_eventType_paymentMethodId_debitAccountId_creditAccountId_key" ON "AccountingMapping"("eventType", "paymentMethodId", "debitAccountId", "creditAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEvent_idempotencyKey_key" ON "AccountingEvent"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEvent_entryId_key" ON "AccountingEvent"("entryId");

-- CreateIndex
CREATE INDEX "AccountingEvent_eventType_status_idx" ON "AccountingEvent"("eventType", "status");

-- CreateIndex
CREATE INDEX "AccountingEvent_sourceType_sourceId_idx" ON "AccountingEvent"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ThirdPartyFrameIntake_status_createdAt_idx" ON "ThirdPartyFrameIntake"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ThirdPartyFrameIntake_customerId_idx" ON "ThirdPartyFrameIntake"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "FrameAdaptationOrder_number_key" ON "FrameAdaptationOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "FrameAdaptationOrder_saleId_key" ON "FrameAdaptationOrder"("saleId");

-- CreateIndex
CREATE INDEX "FrameAdaptationOrder_status_createdAt_idx" ON "FrameAdaptationOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FrameAdaptationOrder_customerId_idx" ON "FrameAdaptationOrder"("customerId");

