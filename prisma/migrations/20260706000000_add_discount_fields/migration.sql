-- AlterTable
ALTER TABLE "Session" ADD COLUMN "discountAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "Session" ADD COLUMN "discountNote" TEXT;
