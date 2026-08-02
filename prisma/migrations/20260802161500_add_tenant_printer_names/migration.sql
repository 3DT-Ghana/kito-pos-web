-- Backfills the migration that was never generated for the QZ Tray printer
-- settings on Tenant.
--
-- Both columns were declared in schema.prisma by 3dcbaa2 and applied to
-- production with `prisma db push`, so no migration ever created them. Any
-- database built from migrations alone — a new tenant environment, a local dev
-- reset, a disaster-recovery restore — was missing them, and every query
-- touching Tenant failed. See prisma/migrations/README.md.
--
-- Generated with `prisma migrate diff` from the migrations directory against
-- the datamodel, so it is exactly the delta and nothing more. Both columns are
-- nullable, so this is safe on tables with existing rows.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS     "receiptPrinterName" TEXT,
ADD COLUMN IF NOT EXISTS     "reportPrinterName" TEXT;
