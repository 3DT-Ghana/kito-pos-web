CREATE TYPE "StockTransferStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "initiatedByUserId" TEXT NOT NULL,
    "dispatchedByUserId" TEXT,
    "receivedByUserId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockTransferItem" (
    "id" TEXT NOT NULL,
    "stockTransferId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "itemName" TEXT NOT NULL,
    "barcode" TEXT,
    "expiryDate" TIMESTAMP(3),
    "unitName" TEXT,
    "piecesPerUnit" INTEGER,
    "quantity" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL,
    "sellingPrice" DOUBLE PRECISION NOT NULL,
    "retailPrice" DOUBLE PRECISION,
    "wholesalePrice" DOUBLE PRECISION,
    "promoPrice" DOUBLE PRECISION,

    CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockTransfer_tenantId_status_createdAt_idx"
ON "StockTransfer"("tenantId", "status", "createdAt");

CREATE INDEX "StockTransfer_tenantId_fromBranchId_createdAt_idx"
ON "StockTransfer"("tenantId", "fromBranchId", "createdAt");

CREATE INDEX "StockTransfer_tenantId_toBranchId_createdAt_idx"
ON "StockTransfer"("tenantId", "toBranchId", "createdAt");

CREATE INDEX "StockTransferItem_stockTransferId_idx"
ON "StockTransferItem"("stockTransferId");

ALTER TABLE "StockTransferItem"
ADD CONSTRAINT "StockTransferItem_stockTransferId_fkey"
FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
