import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requireOwner } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ALL_PERMISSIONS, ALL_ROLES, type RolePermissionsMap } from '@/lib/permissions/rbac'

/**
 * GET /api/settings/role-permissions
 * Returns the current effective permission map for all roles.
 * Falls back to defaults when no override exists.
 */
export async function GET() {
  try {
    const { error, tenantId } = await requireTenant()
    if (error) return error

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { rolePermissions: true },
    })

    return NextResponse.json({ rolePermissions: tenant?.rolePermissions ?? null })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch role permissions' }, { status: 500 })
  }
}

/**
 * PUT /api/settings/role-permissions
 * Body: { rolePermissions: Record<Role, string[]> }
 * Only OWNER can update. OWNER's own permissions cannot be restricted.
 */
export async function PUT(req: Request) {
  try {
    const { error, tenantId, user } = await requireTenant()
    if (error) return error

    const { authorized, error: roleError } = requireOwner(user!.role)
    if (!authorized) return roleError!

    const body = await req.json()
    const incoming = body.rolePermissions as RolePermissionsMap

    if (!incoming || typeof incoming !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // Sanitise: only keep known roles and known permission strings; OWNER is always full
    const sanitised: RolePermissionsMap = {}
    const validPerms = new Set<string>(ALL_PERMISSIONS)

    for (const role of ALL_ROLES) {
      if (role === 'OWNER') continue // OWNER always has everything — never persist a restriction
      if (Array.isArray(incoming[role])) {
        sanitised[role] = (incoming[role] as string[]).filter(p => validPerms.has(p))
      }
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { rolePermissions: sanitised },
    })

    return NextResponse.json({ ok: true, rolePermissions: sanitised })
  } catch {
    return NextResponse.json({ error: 'Failed to update role permissions' }, { status: 500 })
  }
}
