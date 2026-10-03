-- Add per-user MB mailbox address
ALTER TABLE "User" ADD COLUMN "mbEmail" TEXT;

-- Each configured MB mailbox can belong to only one user
CREATE UNIQUE INDEX "User_mbEmail_key" ON "User"("mbEmail");
