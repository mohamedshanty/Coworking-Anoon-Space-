-- AlterTable
ALTER TABLE "Staff" ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Staff_phone_key" ON "Staff"("phone");