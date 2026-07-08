-- AlterTable
ALTER TABLE "Session" ADD COLUMN "paymentAccount" TEXT;
ALTER TABLE "Session" ADD COLUMN "calculatedPrice" DECIMAL(10, 2);
ALTER TABLE "Session" ADD COLUMN "finalPrice" DECIMAL(10, 2);
ALTER TABLE "Session" ADD COLUMN "adjustmentNote" TEXT;
