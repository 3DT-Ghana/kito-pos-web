-- Adds the columns introduced by the POS, sales and purchases audit fixes.
--
-- All four were declared in schema.prisma and applied locally with
-- `prisma db push`, so no migration created them. Any database built from
-- migrations alone would be missing them and every query touching Sale or
-- Purchase would fail. See prisma/migrations/README.md.
--
-- Generated with `prisma migrate diff` from the migrations directory against
-- the datamodel, so it is exactly the delta and nothing more.
--
--   Sale.note                      free-text note captured at the till
--   Sale.sourceQuotationId         unique; makes double-converting a quotation
--                                  into a second sale impossible at DB level
--   Purchase.sourcePurchaseOrderId unique; same guarantee for receiving a
--                                  purchase order twice
--   QuotationStatus.CONVERTED      terminal status set by the convert route
--
-- All added columns are nullable, so this is safe on tables with existing rows.
-- The unique indexes only constrain non-NULL values, and every existing row is
-- NULL, so they cannot collide on creation.

-- AlterEnum
-- Kept in its own statement: before PostgreSQL 12 `ALTER TYPE ... ADD VALUE`
-- cannot run inside a transaction block.
ALTER TYPE "QuotationStatus" ADD VALUE IF NOT EXISTS 'CONVERTED';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS     "note" TEXT,
ADD COLUMN IF NOT EXISTS     "sourceQuotationId" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS     "sourcePurchaseOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_sourceQuotationId_key" ON "Sale"("sourceQuotationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Purchase_sourcePurchaseOrderId_key" ON "Purchase"("sourcePurchaseOrderId");
