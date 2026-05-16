-- CreateEnum
CREATE TYPE "TaxCalculationType" AS ENUM ('ADD_TO_PRICE', 'INCLUSIVE');

-- CreateEnum
CREATE TYPE "TaxTransactionType" AS ENUM ('SALE', 'QUOTATION', 'CUSTOMER_RETURN');

-- AlterTable
ALTER TABLE "Sale"
ADD COLUMN "subtotalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleItem"
ADD COLUMN "isTaxable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "taxCalculationType" "TaxCalculationType",
ADD COLUMN "lineSubtotalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "lineTaxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "lineTotalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CustomerReturn"
ADD COLUMN "subtotalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Quotation"
ADD COLUMN "subtotalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QuotationItem"
ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "isTaxable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "taxCalculationType" "TaxCalculationType",
ADD COLUMN "lineSubtotalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "lineTaxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "lineTotalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TenantTaxSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultTaxCalculationType" "TaxCalculationType" NOT NULL DEFAULT 'ADD_TO_PRICE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantTaxSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratePercentage" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "taxPayableAccountId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTaxSetting" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "taxRateId" TEXT,
    "taxCalculationType" "TaxCalculationType",
    "useTenantDefaultTaxes" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductTaxSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTaxRate" (
    "id" TEXT NOT NULL,
    "productTaxSettingId" TEXT NOT NULL,
    "taxRateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTaxLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionType" "TaxTransactionType" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "transactionLineId" TEXT NOT NULL,
    "saleId" TEXT,
    "saleItemId" TEXT,
    "quotationId" TEXT,
    "quotationItemId" TEXT,
    "customerReturnId" TEXT,
    "taxRateId" TEXT,
    "taxName" TEXT NOT NULL,
    "taxRatePercentage" DOUBLE PRECISION NOT NULL,
    "taxableAmount" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "calculationType" "TaxCalculationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionTaxLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantTaxSetting_tenantId_key" ON "TenantTaxSetting"("tenantId");

-- CreateIndex
CREATE INDEX "TaxRate_tenantId_isActive_isDefault_idx" ON "TaxRate"("tenantId", "isActive", "isDefault");

-- CreateIndex
CREATE INDEX "TaxRate_tenantId_name_idx" ON "TaxRate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "TaxRate_tenantId_effectiveFrom_effectiveTo_idx" ON "TaxRate"("tenantId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTaxSetting_productId_key" ON "ProductTaxSetting"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTaxRate_productTaxSettingId_taxRateId_key" ON "ProductTaxRate"("productTaxSettingId", "taxRateId");

-- CreateIndex
CREATE INDEX "ProductTaxRate_taxRateId_idx" ON "ProductTaxRate"("taxRateId");

-- CreateIndex
CREATE INDEX "TransactionTaxLine_tenantId_transactionType_transactionId_idx" ON "TransactionTaxLine"("tenantId", "transactionType", "transactionId");

-- CreateIndex
CREATE INDEX "TransactionTaxLine_tenantId_taxName_createdAt_idx" ON "TransactionTaxLine"("tenantId", "taxName", "createdAt");

-- CreateIndex
CREATE INDEX "TransactionTaxLine_saleId_idx" ON "TransactionTaxLine"("saleId");

-- CreateIndex
CREATE INDEX "TransactionTaxLine_quotationId_idx" ON "TransactionTaxLine"("quotationId");

-- CreateIndex
CREATE INDEX "TransactionTaxLine_customerReturnId_idx" ON "TransactionTaxLine"("customerReturnId");

-- Backfill existing records so historical documents continue to render correctly.
UPDATE "Sale"
SET "subtotalAmount" = "totalAmount",
    "taxAmount" = 0;

UPDATE "SaleItem"
SET "lineSubtotalAmount" = GREATEST(("price" * "quantity") - COALESCE("discountAmount", 0), 0),
    "lineTaxAmount" = 0,
    "lineTotalAmount" = GREATEST(("price" * "quantity") - COALESCE("discountAmount", 0), 0);

UPDATE "CustomerReturn"
SET "subtotalAmount" = "amount",
    "taxAmount" = 0;

UPDATE "Quotation"
SET "subtotalAmount" = "totalAmount",
    "taxAmount" = 0;

UPDATE "QuotationItem"
SET "lineSubtotalAmount" = GREATEST(("price" * "quantity") - COALESCE("discountAmount", 0), 0),
    "lineTaxAmount" = 0,
    "lineTotalAmount" = GREATEST(("price" * "quantity") - COALESCE("discountAmount", 0), 0);

-- AddForeignKey
ALTER TABLE "TenantTaxSetting"
ADD CONSTRAINT "TenantTaxSetting_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate"
ADD CONSTRAINT "TaxRate_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate"
ADD CONSTRAINT "TaxRate_taxPayableAccountId_fkey"
FOREIGN KEY ("taxPayableAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTaxSetting"
ADD CONSTRAINT "ProductTaxSetting_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTaxSetting"
ADD CONSTRAINT "ProductTaxSetting_taxRateId_fkey"
FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTaxRate"
ADD CONSTRAINT "ProductTaxRate_productTaxSettingId_fkey"
FOREIGN KEY ("productTaxSettingId") REFERENCES "ProductTaxSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTaxRate"
ADD CONSTRAINT "ProductTaxRate_taxRateId_fkey"
FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTaxLine"
ADD CONSTRAINT "TransactionTaxLine_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTaxLine"
ADD CONSTRAINT "TransactionTaxLine_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTaxLine"
ADD CONSTRAINT "TransactionTaxLine_saleItemId_fkey"
FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTaxLine"
ADD CONSTRAINT "TransactionTaxLine_quotationId_fkey"
FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTaxLine"
ADD CONSTRAINT "TransactionTaxLine_quotationItemId_fkey"
FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTaxLine"
ADD CONSTRAINT "TransactionTaxLine_customerReturnId_fkey"
FOREIGN KEY ("customerReturnId") REFERENCES "CustomerReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTaxLine"
ADD CONSTRAINT "TransactionTaxLine_taxRateId_fkey"
FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
