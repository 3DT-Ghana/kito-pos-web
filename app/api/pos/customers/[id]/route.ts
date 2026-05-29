import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/permissions/rbac'
import {
  isBranchFilterActive,
  requireBranchAccess,
} from '@/lib/branch/server'
import { getScopedCustomerMetrics } from '@/lib/branch/scopedMetrics'
import { requireTenantFeature } from '@/lib/tenant/features'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: RouteParams) {
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

    const { id } = await params
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        tenantId: context!.tenantId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        balance: true,
      },
    })

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (!isBranchFilterActive(context!)) {
      return NextResponse.json(customer)
    }

    const metrics = await getScopedCustomerMetrics(context!, [id])

    return NextResponse.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      balance: metrics.get(id)?.balance ?? 0,
    })
  } catch (error) {
    console.error('Failed to fetch POS customer:', error)
    return NextResponse.json({ error: 'Failed to fetch POS customer' }, { status: 500 })
  }
}
