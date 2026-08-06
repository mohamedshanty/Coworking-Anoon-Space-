-- CreateEnum
CREATE TYPE "WalletTxnType" AS ENUM ('topup', 'deduction');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'wallet';

-- CreateTable
CREATE TABLE "SnackWallet" (
    "id" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnackWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnackWalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "WalletTxnType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balanceBefore" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnackWalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SnackWallet_phone_key" ON "SnackWallet"("phone");

-- AddForeignKey
ALTER TABLE "SnackWalletTransaction" ADD CONSTRAINT "SnackWalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "SnackWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
