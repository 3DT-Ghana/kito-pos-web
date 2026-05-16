ALTER TABLE "PurchaseOrder"
ADD COLUMN "branchId" TEXT;

UPDATE "PurchaseOrder" AS po
SET "branchId" = branch_map."branchId"
FROM (
    SELECT
        po_inner."id" AS "purchaseOrderId",
        MIN(i."branchId") AS "branchId",
        COUNT(*) AS "itemCount",
        COUNT(i."id") FILTER (WHERE i."branchId" IS NOT NULL) AS "matchedItemCount",
        COUNT(DISTINCT i."branchId") FILTER (WHERE i."branchId" IS NOT NULL) AS "distinctBranchCount"
    FROM "PurchaseOrder" AS po_inner
    JOIN "PurchaseOrderItem" AS poi
      ON poi."purchaseOrderId" = po_inner."id"
    LEFT JOIN "Item" AS i
      ON i."id" = poi."itemId"
     AND i."tenantId" = po_inner."tenantId"
    GROUP BY po_inner."id"
) AS branch_map
WHERE po."id" = branch_map."purchaseOrderId"
  AND branch_map."itemCount" > 0
  AND branch_map."matchedItemCount" = branch_map."itemCount"
  AND branch_map."distinctBranchCount" = 1;

CREATE INDEX "PurchaseOrder_tenantId_status_createdAt_idx"
ON "PurchaseOrder"("tenantId", "status", "createdAt");

CREATE INDEX "PurchaseOrder_tenantId_branchId_createdAt_idx"
ON "PurchaseOrder"("tenantId", "branchId", "createdAt");
