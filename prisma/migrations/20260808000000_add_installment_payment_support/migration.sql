-- AlterEnum
ALTER TYPE "DebtType" ADD VALUE 'subscription';

-- AlterTable: Subscription - add totalFee
ALTER TABLE "Subscription" ADD COLUMN "totalFee" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill totalFee = amountPaid for existing subscriptions (backward compat: full payment)
UPDATE "Subscription" SET "totalFee" = "amountPaid" WHERE "totalFee" = 0;

-- AlterTable: Debt - add subscriptionId
ALTER TABLE "Debt" ADD COLUMN "subscriptionId" TEXT;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
