import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: RouteParams) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  try {
    const body = await req.json()
    const { name, description, category, setupFee, monthlyFee, yearlyFee, oneTimeFee, discount, commissionRate, vatRate, sortOrder, isActive } = body

    const updated = await prisma.featureModule.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() ?? null } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(setupFee !== undefined ? { setupFee } : {}),
        ...(monthlyFee !== undefined ? { monthlyFee } : {}),
        ...(yearlyFee !== undefined ? { yearlyFee } : {}),
        ...(oneTimeFee !== undefined ? { oneTimeFee } : {}),
        ...(discount !== undefined ? { discount } : {}),
        ...(commissionRate !== undefined ? { commissionRate } : {}),
        ...(vatRate !== undefined ? { vatRate } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'feature_module.updated',
        entity: 'FeatureModule',
        entityId: id,
        details: body,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update feature module' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  try {
    const inUse = await prisma.tenantPlanFeature.findFirst({ where: { featureId: id } })
    if (inUse) {
      return NextResponse.json({ error: 'This module is assigned to one or more tenant plans and cannot be deleted.' }, { status: 409 })
    }

    await prisma.featureModule.delete({ where: { id } })

    await prisma.platformAuditLog.create({
      data: { actorEmail: context!.email, action: 'feature_module.deleted', entity: 'FeatureModule', entityId: id },
    })

    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to delete feature module' }, { status: 500 })
  }
}
