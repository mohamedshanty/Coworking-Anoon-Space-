-- AlterEnum
ALTER TYPE "SubscriptionPackage" ADD VALUE 'half_month';

-- AlterTable
ALTER TABLE "Visitor" ADD COLUMN     "notes" TEXT;
