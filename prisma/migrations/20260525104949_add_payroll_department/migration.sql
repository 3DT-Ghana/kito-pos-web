-- CreateTable
CREATE TABLE "PayrollDepartment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollDepartment_tenantId_name_key" ON "PayrollDepartment"("tenantId", "name");

-- CreateIndex
CREATE INDEX "PayrollDepartment_tenantId_idx" ON "PayrollDepartment"("tenantId");

-- AddForeignKey
ALTER TABLE "PayrollDepartment" ADD CONSTRAINT "PayrollDepartment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
