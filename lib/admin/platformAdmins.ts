import { compare } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { Role } from '@/lib/permissions/rbac'

const platformAdminAuthSelect = {
  id: true,
  email: true,
  name: true,
  passwordHash: true,
} satisfies Prisma.PlatformAdminSelect

const platformAdminSessionSelect = {
  id: true,
  email: true,
  name: true,
} satisfies Prisma.PlatformAdminSelect

type PlatformAdminAuthRecord = Prisma.PlatformAdminGetPayload<{
  select: typeof platformAdminAuthSelect
}>

type PlatformAdminSessionRecord = Prisma.PlatformAdminGetPayload<{
  select: typeof platformAdminSessionSelect
}>

type PlatformAdminAuthAttempt =
  | { status: 'not_found' }
  | { status: 'invalid_password' }
  | { status: 'success'; user: ReturnType<typeof toPlatformAdminAuthUser> }

interface CachedPlatformAdminSessionEntry {
  expiresAt: number
  value: PlatformAdminSessionRecord
}

interface CachedPlatformAdminAuthEntry {
  expiresAt: number
  value: PlatformAdminAuthRecord
}

const PLATFORM_ADMIN_SESSION_CACHE_TTL_MS = 5 * 60 * 1000

const globalForPlatformAdminSessionCache = globalThis as unknown as {
  platformAdminSessionCache?: Map<string, CachedPlatformAdminSessionEntry>
  platformAdminAuthCache?: Map<string, CachedPlatformAdminAuthEntry>
}

export function getLegacySuperAdminEmails() {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function getPlatformAdminSessionCache() {
  if (!globalForPlatformAdminSessionCache.platformAdminSessionCache) {
    globalForPlatformAdminSessionCache.platformAdminSessionCache = new Map()
  }

  return globalForPlatformAdminSessionCache.platformAdminSessionCache
}

function getPlatformAdminAuthCache() {
  if (!globalForPlatformAdminSessionCache.platformAdminAuthCache) {
    globalForPlatformAdminSessionCache.platformAdminAuthCache = new Map()
  }

  return globalForPlatformAdminSessionCache.platformAdminAuthCache
}

function getPlatformAdminCacheKeys(args: {
  platformAdminId?: string | null
  email?: string | null
}) {
  const keys: string[] = []

  if (args.platformAdminId) {
    keys.push(`id:${args.platformAdminId}`)
  }

  if (args.email) {
    keys.push(`email:${normalizeEmail(args.email)}`)
  }

  return keys
}

function cachePlatformAdminSessionRecord(platformAdmin: PlatformAdminSessionRecord) {
  const entry = {
    value: platformAdmin,
    expiresAt: Date.now() + PLATFORM_ADMIN_SESSION_CACHE_TTL_MS,
  }

  const cache = getPlatformAdminSessionCache()
  cache.set(`id:${platformAdmin.id}`, entry)
  cache.set(`email:${normalizeEmail(platformAdmin.email)}`, entry)

  return platformAdmin
}

function cachePlatformAdminAuthRecord(platformAdmin: PlatformAdminAuthRecord) {
  getPlatformAdminAuthCache().set(normalizeEmail(platformAdmin.email), {
    value: platformAdmin,
    expiresAt: Date.now() + PLATFORM_ADMIN_SESSION_CACHE_TTL_MS,
  })

  cachePlatformAdminSessionRecord({
    id: platformAdmin.id,
    email: platformAdmin.email,
    name: platformAdmin.name,
  })

  return platformAdmin
}

function getCachedPlatformAdminAuthRecord(
  email: string,
  options?: {
    allowStale?: boolean
  }
) {
  const entry = getPlatformAdminAuthCache().get(normalizeEmail(email))
  if (!entry) {
    return null
  }

  if (entry.expiresAt > Date.now()) {
    return entry.value
  }

  if (options?.allowStale) {
    return entry.value
  }

  return null
}

function getCachedPlatformAdminSessionRecord(
  args: {
    platformAdminId?: string | null
    email?: string | null
  },
  options?: {
    allowStale?: boolean
  }
) {
  const now = Date.now()
  let newestEntry: CachedPlatformAdminSessionEntry | null = null

  for (const key of getPlatformAdminCacheKeys(args)) {
    const entry = getPlatformAdminSessionCache().get(key)
    if (!entry) {
      continue
    }

    if (entry.expiresAt > now) {
      return entry.value
    }

    if (!newestEntry || entry.expiresAt > newestEntry.expiresAt) {
      newestEntry = entry
    }
  }

  if (options?.allowStale && newestEntry) {
    return newestEntry.value
  }

  return null
}

function toPlatformAdminAuthUser(platformAdmin: PlatformAdminSessionRecord) {
  return {
    id: platformAdmin.id,
    email: platformAdmin.email,
    name: platformAdmin.name,
    role: Role.OWNER,
    branchId: null,
    tenantId: null,
    platformRole: 'SUPER_ADMIN' as const,
    platformAdminId: platformAdmin.id,
  }
}

async function provisionLegacyPlatformAdminByEmail(
  normalizedEmail: string
): Promise<PlatformAdminAuthRecord | null> {
  if (!getLegacySuperAdminEmails().includes(normalizedEmail)) {
    return null
  }

  const legacyUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      email: true,
      name: true,
      password: true,
    },
  })

  if (!legacyUser) {
    return null
  }

  const platformAdmin = await prisma.platformAdmin.upsert({
    where: { email: normalizedEmail },
    update: {},
    create: {
      email: normalizedEmail,
      name: legacyUser.name,
      passwordHash: legacyUser.password,
    },
    select: platformAdminAuthSelect,
  })

  return cachePlatformAdminAuthRecord(platformAdmin)
}

export async function ensurePlatformAdminByEmail(
  email: string
): Promise<PlatformAdminAuthRecord | null> {
  const normalizedEmail = normalizeEmail(email)

  const cached = getCachedPlatformAdminAuthRecord(normalizedEmail)
  if (cached) {
    return cached
  }

  try {
    const existing = await prisma.platformAdmin.findUnique({
      where: { email: normalizedEmail },
      select: platformAdminAuthSelect,
    })

    if (existing) {
      return cachePlatformAdminAuthRecord(existing)
    }

    return provisionLegacyPlatformAdminByEmail(normalizedEmail)
  } catch (error) {
    const stale = getCachedPlatformAdminAuthRecord(normalizedEmail, { allowStale: true })
    if (stale) {
      return stale
    }

    throw error
  }
}

export async function authorizePlatformAdminCredentials(
  email: string,
  password: string
): Promise<PlatformAdminAuthAttempt> {
  const platformAdmin = await ensurePlatformAdminByEmail(email)
  if (!platformAdmin) {
    return { status: 'not_found' }
  }

  const valid = await compare(password, platformAdmin.passwordHash)
  if (!valid) {
    return { status: 'invalid_password' }
  }

  cachePlatformAdminAuthRecord(platformAdmin)

  return {
    status: 'success',
    user: toPlatformAdminAuthUser(platformAdmin),
  }
}

export async function findPlatformAdminForSession(args: {
  platformAdminId?: string | null
  email?: string | null
}): Promise<PlatformAdminSessionRecord | null> {
  const cached = getCachedPlatformAdminSessionRecord(args)
  if (cached) {
    return cached
  }

  try {
    if (args.platformAdminId) {
      const byId = await prisma.platformAdmin.findUnique({
        where: { id: args.platformAdminId },
        select: platformAdminSessionSelect,
      })

      if (byId) {
        return cachePlatformAdminSessionRecord(byId)
      }
    }

    if (!args.email) {
      return null
    }

    const normalizedEmail = normalizeEmail(args.email)

    const existing = await prisma.platformAdmin.findUnique({
      where: { email: normalizedEmail },
      select: platformAdminSessionSelect,
    })

    if (existing) {
      return cachePlatformAdminSessionRecord(existing)
    }

    const provisioned = await provisionLegacyPlatformAdminByEmail(normalizedEmail)
    if (!provisioned) {
      return null
    }

    return cachePlatformAdminSessionRecord({
      id: provisioned.id,
      email: provisioned.email,
      name: provisioned.name,
    })
  } catch (error) {
    const stale = getCachedPlatformAdminSessionRecord(args, { allowStale: true })
    if (stale) {
      return stale
    }

    console.error('Failed to refresh platform admin session record:', error)
    return null
  }
}
