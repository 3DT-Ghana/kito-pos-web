import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/db/prisma'
import type { RolePermissionsMap } from '@/lib/permissions/rbac'
import {
  TENANT_FEATURE_SELECT,
  type TenantFeatureFlags,
} from '@/lib/tenant/features'

/**
 * Tenant Enforcement Middleware
 *
 * CRITICAL SECURITY COMPONENT - Ensures multi-tenant data isolation
 *
 * Features:
 * - Extracts tenantId from authenticated session
 * - Validates user is authenticated
 * - Validates user has a tenant associated
 * - Returns tenantId for database query filtering
 * - Provides consistent error responses
 *
 * Usage in API Routes:
 * ```typescript
 * import { requireTenant } from '@/lib/tenant/requireTenant'
 *
 * export async function GET() {
 *   const { error, tenantId, user } = await requireTenant()
 *   if (error) return error
 *
 *   // All queries MUST filter by tenantId
 *   const items = await prisma.item.findMany({
 *     where: { tenantId }
 *   })
 *
 *   return NextResponse.json(items)
 * }
 * ```
 */

export type TenantContext =
  | {
      error: NextResponse
      tenantId: null
      user: null
      rolePermissions: null
      features: null
    }
  | {
      error: null
      tenantId: string
      user: Session['user']
      rolePermissions: RolePermissionsMap | null
      features: TenantFeatureFlags
    }

/**
 * Require Tenant Middleware
 *
 * Validates authentication and tenant association
 * Returns tenantId for database filtering
 */
export async function requireTenant(): Promise<TenantContext> {
  const session = await getServerSession(authOptions)

  // Check if user is authenticated
  if (!session || !session.user) {
    return {
      error: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'You must be logged in to access this resource'
        },
        { status: 401 }
      ),
      tenantId: null,
      user: null,
      rolePermissions: null,
      features: null,
    }
  }

  // Check if user has a tenant associated
  if (!session.user.tenantId) {
    return {
      error: NextResponse.json(
        {
          error: 'Forbidden',
          message: 'No tenant associated with your account. Please contact support.'
        },
        { status: 403 }
      ),
      tenantId: null,
      user: null,
      rolePermissions: null,
      features: null,
    }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: {
      rolePermissions: true,
      ...TENANT_FEATURE_SELECT,
    },
  })

  if (!tenant) {
    return {
      error: NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Your tenant could not be found. Please contact support.',
        },
        { status: 403 }
      ),
      tenantId: null,
      user: null,
      rolePermissions: null,
      features: null,
    }
  }

  // Success - return tenant context
  return {
    error: null,
    tenantId: session.user.tenantId,
    user: session.user,
    rolePermissions: (tenant.rolePermissions as RolePermissionsMap | null) ?? null,
    features: {
      enableBranches: tenant.enableBranches,
      enableQuotations: tenant.enableQuotations,
      enablePurchaseOrders: tenant.enablePurchaseOrders,
      enableTill: tenant.enableTill,
      enableAccounting: tenant.enableAccounting,
      enablePayroll: tenant.enablePayroll,
      requireApproval: tenant.requireApproval,
    },
  }
}

/**
 * Helper function to create tenant filter object
 *
 * Usage:
 * ```typescript
 * const filter = withTenantId(tenantId)
 * // Returns: { tenantId: "uuid..." }
 *
 * await prisma.item.findMany({
 *   where: { ...filter, name: { contains: 'search' } }
 * })
 * ```
 */
export function withTenantId(tenantId: string) {
  return { tenantId }
}

/**
 * Helper function to validate tenantId in request data
 *
 * Prevents users from submitting data with a different tenantId
 * than their own (data injection attack)
 *
 * Usage:
 * ```typescript
 * const body = await req.json()
 * const validationError = validateTenantId(body.tenantId, tenantId)
 * if (validationError) return validationError
 * ```
 */
export function validateTenantId(
  requestTenantId: string | undefined,
  sessionTenantId: string
): NextResponse | null {
  // If tenantId is provided in request, it must match session
  if (requestTenantId && requestTenantId !== sessionTenantId) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: 'TenantId mismatch. You can only access your own tenant data.'
      },
      { status: 403 }
    )
  }

  return null
}

/**
 * Get current tenant context (for use in Server Components)
 *
 * Usage:
 * ```typescript
 * const tenant = await getCurrentTenant()
 * if (!tenant) redirect('/auth/login')
 * ```
 */
export async function getCurrentTenant() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.tenantId) {
    return null
  }

  return {
    tenantId: session.user.tenantId,
    user: session.user,
  }
}
