-- AlterTable
-- NOTE (2026-09-23): history repair — renamed from 20250715... (which sorted
-- before the init migration and broke fresh replays) to 20260626... and made
-- idempotent with IF NOT EXISTS, so re-applying is a safe no-op.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "customerName" TEXT,
ADD COLUMN IF NOT EXISTS "notes" TEXT;
