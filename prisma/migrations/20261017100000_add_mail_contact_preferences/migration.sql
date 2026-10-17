CREATE TABLE "MailContactPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "contactType" TEXT NOT NULL,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "blocked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MailContactPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MailContactPreference_userId_email_key" ON "MailContactPreference"("userId", "email");
CREATE INDEX "MailContactPreference_userId_contactType_hidden_idx" ON "MailContactPreference"("userId", "contactType", "hidden");
ALTER TABLE "MailContactPreference" ADD CONSTRAINT "MailContactPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
