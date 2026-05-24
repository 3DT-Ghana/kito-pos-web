import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'

/**
 * GET  /api/admin/tenant-plans  — list all tenant plans with tenant info
 */
export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const plans = await prisma.tenantBusinessPlan.findMany({
    include: {
      features: { include: { feature: { select: { id: true, key: true, name: true } } } },
      items: { include: { item: { select: { id: true, name: true } } } },
      _count: { select: { invoices: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Attach tenant name
  const tenantIds = plans.map((p) => p.tenantId)
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, name: true, status: true },
  })
  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]))

  return NextResponse.json(plans.map((p) => ({ ...p, tenant: tenantMap[p.tenantId] ?? null })))
}
