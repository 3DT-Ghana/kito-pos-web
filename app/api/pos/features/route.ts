import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'

export async function GET() {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enablePosTerminal')
    if (featureError) return featureError

    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: {
        enableRetailPrice: true,
        enableWholesalePrice: true,
        enablePromoPrice: true,
        enableDiscounts: true,
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    return NextResponse.json({
      enableRetailPrice: tenant.enableRetailPrice,
      enableWholesalePrice: tenant.enableWholesalePrice,
      enablePromoPrice: tenant.enablePromoPrice,
      enableDiscounts: tenant.enableDiscounts,
      enableCreditSales: context!.features.enableCreditSales,
      requireApproval: context!.features.requireApproval,
    })
  } catch (error) {
    console.error('Failed to fetch POS feature flags:', error)
    return NextResponse.json({ error: 'Failed to fetch POS feature flags' }, { status: 500 })
  }
}
