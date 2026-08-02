-- Finance module audit fixes.
--
--   Expense.method                 how the expense was paid. Without it the
--                                  till deducted every expense from the cash
--                                  drawer, so a bank-paid bill created a false
--                                  shortage at close.
--   CustomerPayment.customer       relation. Without it the payments history
--   SupplierPayment.supplier       page could not resolve a name and rendered
--                                  "Unknown" for every row.
--   CashRegister index             supports the open-shift lookup that the
--                                  open/close guards now run on every request.
--
-- Generated with `prisma migrate diff` from the migrations directory against
-- the datamodel, so it is exactly the delta.

-- AlterTable
-- Defaults to CASH, which matches the behaviour every existing row was created
-- under (the journal engine already fell back to CASH), so this is a faithful
-- backfill rather than a guess.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "method" "PaymentMethod" NOT NULL DEFAULT 'CASH';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CashRegister_tenantId_branchId_userId_status_idx"
  ON "CashRegister"("tenantId", "branchId", "userId", "status");

-- The two foreign keys below will fail if any payment row references a
-- customer or supplier that no longer exists. Fail loudly with a clear message
-- rather than letting Postgres report a bare constraint violation.
DO $$
DECLARE
  orphan_customers INT;
  orphan_suppliers INT;
BEGIN
  SELECT count(*) INTO orphan_customers
  FROM "CustomerPayment" p
  LEFT JOIN "Customer" c ON p."customerId" = c.id
  WHERE c.id IS NULL;

  SELECT count(*) INTO orphan_suppliers
  FROM "SupplierPayment" p
  LEFT JOIN "Supplier" s ON p."supplierId" = s.id
  WHERE s.id IS NULL;

  IF orphan_customers > 0 OR orphan_suppliers > 0 THEN
    RAISE EXCEPTION
      'Cannot add payment foreign keys: % customer payment(s) and % supplier payment(s) reference records that no longer exist. Reassign or remove those rows first.',
      orphan_customers, orphan_suppliers;
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "CustomerPayment" DROP CONSTRAINT IF EXISTS "CustomerPayment_customerId_fkey";
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" DROP CONSTRAINT IF EXISTS "SupplierPayment_supplierId_fkey";
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
