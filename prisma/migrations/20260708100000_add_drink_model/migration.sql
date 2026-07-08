-- CreateEnum
CREATE TYPE "DrinkUnit" AS ENUM ('PIECE', 'OUNCE', 'GRAM', 'ML');

-- CreateTable
CREATE TABLE "Drink" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" "DrinkUnit" NOT NULL DEFAULT 'PIECE',
    "sellPrice" DECIMAL(10, 2) NOT NULL,
    "costPrice" DECIMAL(10, 2) NOT NULL,
    "lastRestockDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertThreshold" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "Drink_pkey" PRIMARY KEY ("id")
);
