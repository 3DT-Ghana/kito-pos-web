import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'

const PRICE_OVERRIDE_ROLES = new Set(['OWNER', 'STORE_MANAGER', 'BRANCH_MANAGER'])

export async function GET() {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enablePosTerminal')
    if (featureError) return featureError

    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { name: true },
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    return NextResponse.json({
      businessName: tenant.name,
      branchId: context!.currentBranchId,
      branchName: context!.currentBranch?.name ?? null,
      canOverridePrice: PRICE_OVERRIDE_ROLES.has(context!.user.role),
    })
  } catch (error) {
    console.error('Failed to fetch POS session:', error)
    return NextResponse.json({ error: 'Failed to fetch POS session' }, { status: 500 })
  }
}
