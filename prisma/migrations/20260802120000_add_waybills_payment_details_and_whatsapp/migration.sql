-- Backfills the migration that was never generated for the waybills feature,
-- the bank/MoMo payment detail fields and the WhatsApp tenant settings.
--
-- schema.prisma declared all of this, and app code shipped against it
-- (app/waybills, app/api/waybills, lib/waybills/server.ts, lib/whatsapp/meta.ts,
-- app/settings/WhatsAppSettings.tsx), but no migration created the objects — the
-- schema had been applied with `prisma db push` instead. On any environment
-- built from migrations, every one of those features failed at runtime because
-- the tables and columns did not exist.
--
-- Generated with `prisma migrate diff` against a database with all prior
-- migrations applied, so it is exactly the delta and nothing more. Every added
-- column is nullable or has a default, so it is safe on tables with existing rows.

-- CreateEnum
CREATE TYPE "WaybillStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "CustomerPayment" ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankReference" TEXT,
ADD COLUMN     "momoPhone" TEXT;

-- AlterTable
ALTER TABLE "CustomerReturn" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankReference" TEXT,
ADD COLUMN     "momoPhone" TEXT;

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankReference" TEXT,
ADD COLUMN     "momoPhone" TEXT;

-- AlterTable
ALTER TABLE "SupplierReturn" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "enableWhatsApp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metaWabaPhoneNumberId" TEXT,
ADD COLUMN     "metaWabaToken" TEXT;

-- CreateTable
CREATE TABLE "Waybill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "waybillNumber" TEXT NOT NULL,
    "status" "WaybillStatus" NOT NULL DEFAULT 'DRAFT',
    "saleId" TEXT,
    "shipperName" TEXT NOT NULL,
    "shipperAddress" TEXT,
    "shipperPhone" TEXT,
    "consigneeName" TEXT NOT NULL,
    "consigneeAddress" TEXT NOT NULL,
    "consigneePhone" TEXT,
    "driverName" TEXT,
    "vehicleNumber" TEXT,
    "carrierName" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedById" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveredById" TEXT,
    "notes" TEXT,
    "receivedBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Waybill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaybillItem" (
    "id" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "weight" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "WaybillItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Waybill_tenantId_idx" ON "Waybill"("tenantId");

-- CreateIndex
CREATE INDEX "Waybill_tenantId_status_idx" ON "Waybill"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Waybill_saleId_idx" ON "Waybill"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Waybill_tenantId_waybillNumber_key" ON "Waybill"("tenantId", "waybillNumber");

-- CreateIndex
CREATE INDEX "WaybillItem_waybillId_idx" ON "WaybillItem"("waybillId");

-- AddForeignKey
ALTER TABLE "WaybillItem" ADD CONSTRAINT "WaybillItem_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "Waybill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

