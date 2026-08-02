import { prisma } from '@/lib/db/prisma'

export const DEFAULT_PLATFORM_SETTINGS = {
  idleTimeoutMinutes: 5,
  sessionMaxHours: 4,
} as const

interface PlatformSettingsSnapshot {
  idleTimeoutMinutes: number
  sessionMaxHours: number
}

interface CachedPlatformSettingsEntry {
  expiresAt: number
  value: PlatformSettingsSnapshot
}

const PLATFORM_SETTINGS_CACHE_TTL_MS = 60 * 1000

const globalForPlatformSettingsCache = globalThis as unknown as {
  platformSettingsCache?: CachedPlatformSettingsEntry
}

function getCachedEntry() {
  return globalForPlatformSettingsCache.platformSettingsCache
}

function setCachedEntry(value: PlatformSettingsSnapshot) {
  globalForPlatformSettingsCache.platformSettingsCache = {
    value,
    expiresAt: Date.now() + PLATFORM_SETTINGS_CACHE_TTL_MS,
  }

  return value
}

export function primePlatformSettingsCache(value: PlatformSettingsSnapshot) {
  return setCachedEntry(value)
}

export function getDefaultPlatformSettings() {
  return { ...DEFAULT_PLATFORM_SETTINGS }
}

export async function getCachedPlatformSettings(): Promise<PlatformSettingsSnapshot> {
  const cached = getCachedEntry()
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: 'global' },
      select: {
        idleTimeoutMinutes: true,
        sessionMaxHours: true,
      },
    })

    return setCachedEntry({
      idleTimeoutMinutes: settings?.idleTimeoutMinutes ?? DEFAULT_PLATFORM_SETTINGS.idleTimeoutMinutes,
      sessionMaxHours: settings?.sessionMaxHours ?? DEFAULT_PLATFORM_SETTINGS.sessionMaxHours,
    })
  } catch (error) {
    if (cached) {
      return cached.value
    }

    console.error('Failed to load platform settings, using defaults:', error)
    return getDefaultPlatformSettings()
  }
}
