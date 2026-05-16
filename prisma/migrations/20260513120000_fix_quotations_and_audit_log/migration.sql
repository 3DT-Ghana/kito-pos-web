ALTER TABLE "Quotation"
ADD COLUMN "branchId" TEXT;

CREATE INDEX "Quotation_tenantId_status_createdAt_idx"
ON "Quotation"("tenantId", "status", "createdAt");

CREATE INDEX "Quotation_tenantId_branchId_createdAt_idx"
ON "Quotation"("tenantId", "branchId", "createdAt");

ALTER TABLE "AuditLog"
ADD COLUMN "entityId" TEXT,
ADD COLUMN "details" JSONB;

CREATE INDEX "AuditLog_tenantId_entity_entityId_createdAt_idx"
ON "AuditLog"("tenantId", "entity", "entityId", "createdAt");

CREATE INDEX "AuditLog_tenantId_userId_createdAt_idx"
ON "AuditLog"("tenantId", "userId", "createdAt");
