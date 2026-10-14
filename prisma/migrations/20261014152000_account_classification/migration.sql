-- Add an explicit classification for payable accounts.
-- Existing rows remain valid and receive a conservative default.
ALTER TABLE "Account"
ADD COLUMN "classification" TEXT NOT NULL DEFAULT 'OUTRA_OBRIGACAO';
