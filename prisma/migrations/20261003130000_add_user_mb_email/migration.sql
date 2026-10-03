ALTER TABLE "User" ADD COLUMN "mbEmail" TEXT;
CREATE UNIQUE INDEX "User_mbEmail_key" ON "User"("mbEmail");