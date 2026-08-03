-- Approval-grant hardening and payroll loan-repayment traceability.
--
--   ConsumedApprovalGrant       records redeemed approval grants. A grant is a
--                               short-lived signed token minted when a manager
--                               enters their PIN; with no consumption record it
--                               was a bearer token that could be replayed until
--                               it expired. The unique jti makes redemption
--                               single-use.
--   LoanRepayment.payrollRunId  links a repayment to the run that recorded it.
--                               Without it, deleting a draft payroll run left
--                               the repayment orphaned and the employee's loan
--                               permanently credited for money never repaid.
--
-- Both are additive: a new table and a nullable column, safe on existing rows.

-- AlterTable
ALTER TABLE "LoanRepayment" ADD COLUMN IF NOT EXISTS "payrollRunId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConsumedApprovalGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "saleId" TEXT,
    "approverId" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumedApprovalGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ConsumedApprovalGrant_jti_key" ON "ConsumedApprovalGrant"("jti");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConsumedApprovalGrant_tenantId_consumedAt_idx" ON "ConsumedApprovalGrant"("tenantId", "consumedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoanRepayment_payrollRunId_idx" ON "LoanRepayment"("payrollRunId");
