import { Role } from '@prisma/client'

export const TENANT_ADMIN_ROLES = [Role.OWNER, Role.STORE_MANAGER] as const

export type TenantAdminRole = (typeof TENANT_ADMIN_ROLES)[number]

export const tenantAdminUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const

export function isTenantAdminRole(value: unknown): value is TenantAdminRole {
  return typeof value === 'string' && TENANT_ADMIN_ROLES.includes(value as TenantAdminRole)
}

export function isTenantAdminUserRole(value: string) {
  return TENANT_ADMIN_ROLES.includes(value as TenantAdminRole)
}
