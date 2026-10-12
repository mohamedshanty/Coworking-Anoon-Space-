-- CreateTable
CREATE TABLE "PersonAudit" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromType" TEXT,
    "toType" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonAudit_visitorId_idx" ON "PersonAudit"("visitorId");
