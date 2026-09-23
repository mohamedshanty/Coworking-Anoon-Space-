-- AlterTable: Add hourlyRate column to session table
ALTER TABLE "session" ADD COLUMN "hourlyRate" DECIMAL(10, 2);
