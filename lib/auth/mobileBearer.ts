import type { Session } from 'next-auth'
import { headers } from 'next/headers'
import { verify } from 'jsonwebtoken'
import { Role, type Role as RoleValue } from '@/lib/permissions/rbac'

const VALID_TENANT_ROLES = new Set<RoleValue>(Object.values(Role))

export type TenantSessionUser = Session['user'] & {
  tenantId: string
  branchId: string | null
}

export function normalizeTenantSessionUser(
  user: Session['user'] | null | undefined
): TenantSessionUser | null {
  if (!user?.tenantId || !VALID_TENANT_ROLES.has(user.role)) {
    return null
  }

  return {
    ...user,
    tenantId: user.tenantId,
    branchId: user.branchId ?? null,
  }
}

export async function getBearerTenantSessionUser(): Promise<{
  hasBearerToken: boolean
  configError: boolean
  user: TenantSessionUser | null
}> {
  const headerStore = await headers()
  const authHeader = headerStore.get('authorization')?.trim() ?? ''

  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { hasBearerToken: false, configError: false, user: null }
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    return { hasBearerToken: true, configError: false, user: null }
  }

  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    return { hasBearerToken: true, configError: true, user: null }
  }

  try {
    const payload = verify(token, secret) as Record<string, unknown>
    const role = payload.role
    const tenantId = payload.tenantId

    if (
      typeof payload.id !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof tenantId !== 'string' ||
      typeof role !== 'string' ||
      !VALID_TENANT_ROLES.has(role as RoleValue)
    ) {
      return { hasBearerToken: true, configError: false, user: null }
    }

    return {
      hasBearerToken: true,
      configError: false,
      user: {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        role: role as RoleValue,
        tenantId,
        branchId: typeof payload.branchId === 'string' ? payload.branchId : null,
      },
    }
  } catch {
    return { hasBearerToken: true, configError: false, user: null }
  }
}
