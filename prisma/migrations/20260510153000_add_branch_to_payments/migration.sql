ALTER TABLE "CustomerPayment"
ADD COLUMN "branchId" TEXT;

ALTER TABLE "SupplierPayment"
ADD COLUMN "branchId" TEXT;

CREATE INDEX "CustomerPayment_tenantId_branchId_idx"
ON "CustomerPayment"("tenantId", "branchId");

CREATE INDEX "SupplierPayment_tenantId_branchId_idx"
ON "SupplierPayment"("tenantId", "branchId");
