-- Baseline migration (2026-09-23): capture schema changes that were applied
-- to the live database via `prisma db push` (or equivalent) WITHOUT a
-- migration file, which made `prisma migrate dev` fail with drift:
--   [+] Added tables: DailyNote, VisitorNote (+ VisitorNote -> Visitor FK)
--   [*] Session: added column hourlyPriceOverride
--   [*] Subscription.totalFee: default removed (history had DEFAULT 0)
-- This migration replays those exact changes so a fresh database built from
-- the migration history converges to schema.prisma. It is marked as applied
-- on existing databases via `migrate resolve --applied` (they already have
-- these objects) and runs normally on new databases.

-- CreateTable
CREATE TABLE "DailyNote" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorNote" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorNote_pkey" PRIMARY KEY ("id")
);

-- CreateForeignKey
ALTER TABLE "VisitorNote" ADD CONSTRAINT "VisitorNote_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "hourlyPriceOverride" DECIMAL(10, 2);

-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "totalFee" DROP DEFAULT;
