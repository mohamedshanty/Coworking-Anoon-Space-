-- DropForeignKey
ALTER TABLE "Debt" DROP CONSTRAINT "Debt_visitorId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_visitorId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_visitorId_fkey";

-- DropForeignKey
ALTER TABLE "VisitorNote" DROP CONSTRAINT "VisitorNote_visitorId_fkey";

-- AlterTable
ALTER TABLE "Visitor" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Visitor_deletedAt_idx" ON "Visitor"("deletedAt");

-- CreateIndex
CREATE INDEX "Visitor_type_deletedAt_idx" ON "Visitor"("type", "deletedAt");

-- AddForeignKey
ALTER TABLE "VisitorNote" ADD CONSTRAINT "VisitorNote_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
