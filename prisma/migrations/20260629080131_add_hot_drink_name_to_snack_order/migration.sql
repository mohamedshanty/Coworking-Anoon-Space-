-- DropForeignKey
ALTER TABLE "SnackOrder" DROP CONSTRAINT "SnackOrder_itemId_fkey";

-- AlterTable
ALTER TABLE "SnackOrder" ADD COLUMN     "hotDrinkName" TEXT,
ALTER COLUMN "itemId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "SnackOrder" ADD CONSTRAINT "SnackOrder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
