import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/permissions/rbac'
import {
  isBranchFilterActive,
  requireBranchAccess,
} from '@/lib/branch/server'
import { getScopedCustomerMetrics } from '@/lib/branch/scopedMetrics'
import { requireTenantFeature } from '@/lib/tenant/features'

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enablePosTerminal')
    if (featureError) return featureError

    const { authorized, error: permissionError } = requirePermission(
      context!,
      'view_customers'
    )
    if (!authorized) return permissionError!

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() ?? ''
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') ?? '10', 10) || 10, 1),
      25
    )

    const customers = await prisma.customer.findMany({
      where: {
        tenantId: context!.tenantId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        balance: true,
      },
      orderBy: [{ name: 'asc' }],
      take: limit,
    })

    if (!isBranchFilterActive(context!)) {
      return NextResponse.json({ customers })
    }

    const metrics = await getScopedCustomerMetrics(
      context!,
      customers.map((customer) => customer.id)
    )

    return NextResponse.json({
      customers: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        balance: metrics.get(customer.id)?.balance ?? 0,
      })),
    })
  } catch (error) {
    console.error('Failed to fetch POS customers:', error)
    return NextResponse.json({ error: 'Failed to fetch POS customers' }, { status: 500 })
  }
}
