import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const items = await prisma.businessItem.findMany({
    orderBy: [{ name: 'asc' }],
  })

  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  try {
    const body = await req.json()
    const { name, description, sellingPrice, commissionRate, billingCycle, vatRate } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const item = await prisma.businessItem.create({
      data: {
        name: name.trim(),
        description: description?.trim() ?? null,
        sellingPrice: sellingPrice ?? 0,
        commissionRate: commissionRate ?? 0,
        billingCycle: billingCycle ?? 'ONE_TIME',
        vatRate: vatRate ?? 0,
      },
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'business_item.created',
        entity: 'BusinessItem',
        entityId: item.id,
        details: { name: item.name },
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }
}
