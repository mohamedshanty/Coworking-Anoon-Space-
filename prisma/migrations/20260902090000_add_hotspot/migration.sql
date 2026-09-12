-- CreateEnum
CREATE TYPE "NetUserKind" AS ENUM ('subscriber', 'trainee', 'employee', 'visitor');

-- CreateEnum
CREATE TYPE "NetTier" AS ENUM ('t10', 't20', 't30');

-- CreateEnum
CREATE TYPE "NetEndReason" AS ENUM ('checkout', 'end_of_day', 'idle', 'admin', 'superseded');

-- CreateTable
CREATE TABLE "KnownDevice" (
    "id" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "hostname" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnownDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetSession" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "NetUserKind" NOT NULL,
    "tier" "NetTier" NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "mac" TEXT NOT NULL,
    "ip" TEXT,
    "routerUser" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "minutes" INTEGER,
    "amount" DECIMAL(10,2),
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "endedReason" "NetEndReason",
    "sessionId" TEXT,
    "visitorId" TEXT,

    CONSTRAINT "NetSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotspotAudit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "phone" TEXT,
    "mac" TEXT,
    "ok" BOOLEAN NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotspotAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnownDevice_mac_key" ON "KnownDevice"("mac");

-- CreateIndex
CREATE INDEX "KnownDevice_phone_idx" ON "KnownDevice"("phone");

-- CreateIndex
CREATE INDEX "KnownDevice_lastSeenAt_idx" ON "KnownDevice"("lastSeenAt");

-- CreateIndex
CREATE INDEX "NetSession_phone_idx" ON "NetSession"("phone");

-- CreateIndex
CREATE INDEX "NetSession_endedAt_idx" ON "NetSession"("endedAt");

-- CreateIndex
CREATE INDEX "NetSession_mac_idx" ON "NetSession"("mac");

-- CreateIndex
CREATE INDEX "NetSession_sessionId_idx" ON "NetSession"("sessionId");

-- CreateIndex
CREATE INDEX "NetSession_visitorId_idx" ON "NetSession"("visitorId");

-- CreateIndex
CREATE INDEX "HotspotAudit_createdAt_idx" ON "HotspotAudit"("createdAt");

-- CreateIndex
CREATE INDEX "HotspotAudit_phone_idx" ON "HotspotAudit"("phone");

-- AddForeignKey
ALTER TABLE "NetSession" ADD CONSTRAINT "NetSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetSession" ADD CONSTRAINT "NetSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
