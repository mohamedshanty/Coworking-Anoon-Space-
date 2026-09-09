-- CreateEnum
CREATE TYPE "WalletTxnTarget" AS ENUM ('snack', 'hours', 'mixed');

-- AlterTable: add visitCount to Visitor
ALTER TABLE "Visitor" ADD COLUMN "visitCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: add target to SnackWalletTransaction (nullable; topups stay NULL)
ALTER TABLE "SnackWalletTransaction" ADD COLUMN "target" "WalletTxnTarget";

-- Backfill: existing deduction rows were all snack-only (wallet could only pay for snacks)
UPDATE "SnackWalletTransaction" SET "target" = 'snack' WHERE "type" = 'deduction' AND "target" IS NULL;
