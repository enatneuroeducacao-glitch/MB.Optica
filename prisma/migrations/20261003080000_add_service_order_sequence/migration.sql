-- CreateTable
CREATE TABLE "ServiceOrderSequence" (
    "id" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrderSequence_pkey" PRIMARY KEY ("id")
);
