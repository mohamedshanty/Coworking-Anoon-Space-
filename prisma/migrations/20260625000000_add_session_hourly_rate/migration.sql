-- AlterTable: Add hourlyRate column to Session table
-- NOTE (2026-09-23): history repair. This migration was originally named
-- 20250704000000_... so it sorted BEFORE the 20260624 init migration and could
-- never replay on a fresh database (relation "session"/"Session" did not exist
-- yet), which broke `prisma migrate dev`'s shadow-DB replay. It is renamed to
-- 20260625... (right after init) and made idempotent with IF NOT EXISTS, so
-- re-applying it to databases that already have the column is a safe no-op.
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "hourlyRate" DECIMAL(10, 2);
