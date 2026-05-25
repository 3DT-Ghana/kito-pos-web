import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requireOwner } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

const DEFAULTS = { idleTimeoutMinutes: 5, sessionMaxHours: 4 }

/**
 * GET /api/settings/session
 * Returns the tenant-scoped session timeout settings.
 * Public within the tenant — useIdleTimeout reads this for all authenticated users.
 */
export async function GET() {
  try {
    const { error, tenantId } = await requireTenant()
    if (error) return error

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { idleTimeoutMinutes: true, sessionMaxHours: true },
    })

    return NextResponse.json({
      idleTimeoutMinutes: tenant?.idleTimeoutMinutes ?? DEFAULTS.idleTimeoutMinutes,
      sessionMaxHours:    tenant?.sessionMaxHours    ?? DEFAULTS.sessionMaxHours,
    })
  } catch {
    return NextResponse.json(DEFAULTS)
  }
}

/**
 * PATCH /api/settings/session
 * Updates tenant-scoped session timeout settings.
 * Only OWNER role can update.
 */
export async function PATCH(req: Request) {
  try {
    const { error, tenantId, user } = await requireTenant()
    if (error) return error

    const { authorized, error: roleError } = requireOwner(user!.role)
    if (!authorized) return roleError!

    const body = await req.json()
    const data: Record<string, number> = {}

    const idle = Number(body.idleTimeoutMinutes)
    const sess = Number(body.sessionMaxHours)

    if (Number.isInteger(idle) && idle >= 1 && idle <= 60) data.idleTimeoutMinutes = idle
    if (Number.isInteger(sess) && sess >= 1 && sess <= 24) data.sessionMaxHours = sess

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields. idleTimeoutMinutes: 1–60, sessionMaxHours: 1–24.' },
        { status: 400 }
      )
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: { idleTimeoutMinutes: true, sessionMaxHours: true, updatedAt: true },
    })

    return NextResponse.json({
      idleTimeoutMinutes: tenant.idleTimeoutMinutes,
      sessionMaxHours:    tenant.sessionMaxHours,
      updatedAt:          tenant.updatedAt,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to update session settings' }, { status: 500 })
  }
}
