import { NextResponse } from 'next/server'
import { TaxCalculationType } from '@prisma/client'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requireOwner } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  try {
    const { error, tenantId } = await requireTenant()
    if (error) return error

    const taxSetting = await prisma.tenantTaxSetting.findUnique({
      where: { tenantId: tenantId! },
    })

    return NextResponse.json({
      taxSetting: taxSetting ?? {
        taxEnabled: false,
        defaultTaxCalculationType: TaxCalculationType.ADD_TO_PRICE,
      },
    })
  } catch (err) {
    console.error('Failed to fetch tax settings:', err)
    return NextResponse.json(
      { error: 'Failed to fetch tax settings' },
      { status: 500 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const { error, tenantId, user } = await requireTenant()
    if (error) return error

    const { authorized, error: roleError } = requireOwner(user!.role)
    if (!authorized) return roleError!

    const body = await req.json()
    const taxEnabled = Boolean(body.taxEnabled)
    const defaultTaxCalculationType =
      body.defaultTaxCalculationType ?? TaxCalculationType.ADD_TO_PRICE

    if (!Object.values(TaxCalculationType).includes(defaultTaxCalculationType)) {
      return NextResponse.json(
        { error: 'Invalid tax calculation type' },
        { status: 400 }
      )
    }

    const taxSetting = await prisma.tenantTaxSetting.upsert({
      where: { tenantId: tenantId! },
      update: {
        taxEnabled,
        defaultTaxCalculationType,
      },
      create: {
        tenantId: tenantId!,
        taxEnabled,
        defaultTaxCalculationType,
      },
    })

    return NextResponse.json({ taxSetting })
  } catch (err) {
    console.error('Failed to update tax settings:', err)
    return NextResponse.json(
      { error: 'Failed to update tax settings' },
      { status: 500 }
    )
  }
}
