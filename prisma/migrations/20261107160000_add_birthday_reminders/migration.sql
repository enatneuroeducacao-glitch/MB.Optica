CREATE TABLE "BirthdayReminder" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "birthDate" TIMESTAMP(3) NOT NULL,
  "customerId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BirthdayReminder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BirthdayReminder_birthDate_idx" ON "BirthdayReminder"("birthDate");
CREATE INDEX "BirthdayReminder_customerId_idx" ON "BirthdayReminder"("customerId");
ALTER TABLE "BirthdayReminder"
ADD CONSTRAINT "BirthdayReminder_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
