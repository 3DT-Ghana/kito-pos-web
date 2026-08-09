-- MoMo payment prompts, recorded before Hubtel is called so a till that drops
-- mid-payment cannot take a customer's money without recording the sale.

CREATE TYPE "MomoTransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "MomoTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "clientReference" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "MomoTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "externalTransactionId" TEXT,
    "amountCharged" DOUBLE PRECISION,
    "failureReason" TEXT,
    "salePayload" TEXT,
    "saleId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MomoTransaction_pkey" PRIMARY KEY ("id")
);

-- Unique: one charge per reference, so a retried request cannot double-charge.
CREATE UNIQUE INDEX "MomoTransaction_clientReference_key" ON "MomoTransaction"("clientReference");

-- Unique: the till and the callback race to complete the same payment; this is
-- what stops both winning and creating two sales.
CREATE UNIQUE INDEX "MomoTransaction_saleId_key" ON "MomoTransaction"("saleId");

CREATE INDEX "MomoTransaction_tenantId_status_idx" ON "MomoTransaction"("tenantId", "status");
CREATE INDEX "MomoTransaction_tenantId_createdAt_idx" ON "MomoTransaction"("tenantId", "createdAt");

ALTER TABLE "MomoTransaction" ADD CONSTRAINT "MomoTransaction_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MomoTransaction" ADD CONSTRAINT "MomoTransaction_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
