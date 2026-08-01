-- PayrollDepartment is also created by `20260525104705_baseline`, which was
-- regenerated three minutes after this migration was written and absorbed it.
-- On a fresh database the baseline runs first and this migration then failed
-- with 42P07 (relation already exists), so `migrate deploy` could never
-- complete against a new environment.
--
-- The migration is kept rather than deleted so that any database which applied
-- it before the baseline was regenerated retains a consistent history. Every
-- statement is now guarded, making this a no-op wherever the objects exist.

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollDepartment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollDepartment_tenantId_name_key" ON "PayrollDepartment"("tenantId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollDepartment_tenantId_idx" ON "PayrollDepartment"("tenantId");

-- AddForeignKey
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so the guard is explicit.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PayrollDepartment_tenantId_fkey'
    ) THEN
        ALTER TABLE "PayrollDepartment"
            ADD CONSTRAINT "PayrollDepartment_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
