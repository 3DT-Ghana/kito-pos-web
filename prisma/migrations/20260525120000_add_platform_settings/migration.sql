-- CreateTable
CREATE TABLE IF NOT EXISTS "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 5,
    "sessionMaxHours" INTEGER NOT NULL DEFAULT 4,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByEmail" TEXT,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- Seed the single global settings row so it exists immediately
INSERT INTO "PlatformSettings" ("id", "idleTimeoutMinutes", "sessionMaxHours", "updatedAt")
VALUES ('global', 5, 4, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
