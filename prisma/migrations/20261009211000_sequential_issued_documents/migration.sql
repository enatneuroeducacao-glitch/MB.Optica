CREATE TABLE "DocumentSequence" (
  "type" TEXT NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("type")
);

CREATE TABLE "IssuedDocument" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IssuedDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IssuedDocument_saleId_type_key" ON "IssuedDocument"("saleId","type");
CREATE UNIQUE INDEX "IssuedDocument_type_number_key" ON "IssuedDocument"("type","number");
CREATE INDEX "IssuedDocument_issuedAt_idx" ON "IssuedDocument"("issuedAt");
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "DocumentSequence" ("type","nextNumber") VALUES
  ('CUPOM',1),
  ('RECIBO',1),
  ('CARNE',1),
  ('PROMISSORIA',1);
