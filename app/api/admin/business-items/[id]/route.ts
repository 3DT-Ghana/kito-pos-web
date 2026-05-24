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
    const { name, description, sellingPrice, commissionRate, billingCycle, vatRate, isActive } = body

    const updated = await prisma.businessItem.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() ?? null } : {}),
        ...(sellingPrice !== undefined ? { sellingPrice } : {}),
        ...(commissionRate !== undefined ? { commissionRate } : {}),
        ...(billingCycle !== undefined ? { billingCycle } : {}),
        ...(vatRate !== undefined ? { vatRate } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    })

    await prisma.platformAuditLog.create({
      data: { actorEmail: context!.email, action: 'business_item.updated', entity: 'BusinessItem', entityId: id, details: body },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  try {
    const inUse = await prisma.tenantPlanItem.findFirst({ where: { itemId: id } })
    if (inUse) {
      return NextResponse.json({ error: 'This item is assigned to one or more tenant plans.' }, { status: 409 })
    }

    await prisma.businessItem.delete({ where: { id } })

    await prisma.platformAuditLog.create({
      data: { actorEmail: context!.email, action: 'business_item.deleted', entity: 'BusinessItem', entityId: id },
    })

    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}
