-- Guarded so this converges whether the schema was built from migrations or
-- with `prisma db push`. See prisma/migrations/README.md.
ALTER TABLE "Item"
ADD COLUMN IF NOT EXISTS "reorderLevel" INTEGER NOT NULL DEFAULT 10;
