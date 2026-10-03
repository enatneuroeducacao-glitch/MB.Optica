CREATE TABLE "MailMessageState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MailMessageState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MailMessageState_userId_messageId_key" ON "MailMessageState"("userId","messageId");
CREATE INDEX "MailMessageState_userId_archived_deleted_idx" ON "MailMessageState"("userId","archived","deleted");
ALTER TABLE "MailMessageState" ADD CONSTRAINT "MailMessageState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
