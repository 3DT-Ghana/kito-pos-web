import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { getNextWaybillNumber, waybillSelect } from '@/lib/waybills/server'

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'manage_waybills')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') ?? undefined
    const search = searchParams.get('search')?.trim() ?? ''

    const waybills = await prisma.waybill.findMany({
      // Was tenant-only — every branch could read every other branch's waybills
      where: {
        ...applyBranchScope({ tenantId: context!.tenantId }, context!),
        ...(status ? { status: status as never } : {}),
        ...(search
          ? {
              OR: [
                { waybillNumber: { contains: search, mode: 'insensitive' } },
                { consigneeName: { contains: search, mode: 'insensitive' } },
                { consigneeAddress: { contains: search, mode: 'insensitive' } },
                { driverName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: waybillSelect,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(waybills)
  } catch (err) {
    console.error('[waybills GET]', err)
    return NextResponse.json({ error: 'Failed to fetch waybills' }, { status: 500 })
  }
}

/**
 * getNextWaybillNumber reads-then-writes outside a transaction, so two
 * concurrent creates can pick the same number. The unique constraint catches
 * it, but the caller previously got a 500 and lost the whole form. Retry on
 * P2002 instead.
 */
async function createWaybillWithNumber(
  tenantId: string,
  args: { data: Omit<Parameters<typeof prisma.waybill.create>[0]['data'], 'waybillNumber'>; select: typeof waybillSelect }
) {
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; ; attempt++) {
    const waybillNumber = await getNextWaybillNumber(tenantId)
    try {
      return await prisma.waybill.create({
        data: { ...args.data, waybillNumber } as Parameters<typeof prisma.waybill.create>[0]['data'],
        select: args.select,
      })
    } catch (err) {
      const isDuplicateNumber =
        typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
      if (!isDuplicateNumber || attempt >= MAX_ATTEMPTS) throw err
    }
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'manage_waybills')
    if (!authorized) return permError!

    const body = await req.json()

    const shipperName     = String(body.shipperName ?? '').trim()
    const consigneeName   = String(body.consigneeName ?? '').trim()
    const consigneeAddress = String(body.consigneeAddress ?? '').trim()
    const items: { description: string; quantity: number; unit?: string; weight?: number; notes?: string }[] =
      Array.isArray(body.items) ? body.items : []

    if (!shipperName)      return NextResponse.json({ error: 'Shipper name is required' }, { status: 400 })
    if (!consigneeName)    return NextResponse.json({ error: 'Consignee name is required' }, { status: 400 })
    if (!consigneeAddress) return NextResponse.json({ error: 'Consignee address is required' }, { status: 400 })
    if (items.length === 0) return NextResponse.json({ error: 'Add at least one item' }, { status: 400 })

    for (const item of items) {
      if (!String(item.description ?? '').trim()) {
        return NextResponse.json({ error: 'Each item must have a description' }, { status: 400 })
      }
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
        return NextResponse.json({ error: 'Each item must have a valid quantity' }, { status: 400 })
      }
    }

    // saleId was previously accepted as free text — an ID from another tenant
    // would be stored and printed on the delivery note.
    let saleId: string | null = null
    if (body.saleId) {
      const candidate = String(body.saleId).trim()
      if (candidate) {
        const sale = await prisma.sale.findFirst({
          where: { id: candidate, tenantId: context!.tenantId },
          select: { id: true },
        })
        if (!sale) {
          return NextResponse.json(
            { error: 'The linked sale could not be found in your business.' },
            { status: 400 }
          )
        }
        saleId = sale.id
      }
    }

    const waybill = await createWaybillWithNumber(context!.tenantId, {
      data: {
        tenantId:         context!.tenantId,
        branchId:         context!.currentBranchId ?? undefined,
        saleId,
        shipperName,
        shipperAddress:   String(body.shipperAddress ?? '').trim() || null,
        shipperPhone:     String(body.shipperPhone ?? '').trim() || null,
        consigneeName,
        consigneeAddress,
        consigneePhone:   String(body.consigneePhone ?? '').trim() || null,
        driverName:       String(body.driverName ?? '').trim() || null,
        vehicleNumber:    String(body.vehicleNumber ?? '').trim() || null,
        carrierName:      String(body.carrierName ?? '').trim() || null,
        notes:            String(body.notes ?? '').trim() || null,
        createdById:      context!.user.id,
        items: {
          create: items.map(i => ({
            description: String(i.description).trim(),
            quantity:    Number(i.quantity),
            unit:        String(i.unit ?? 'pcs').trim() || 'pcs',
            weight:      i.weight != null ? Number(i.weight) : null,
            notes:       i.notes ? String(i.notes).trim() : null,
          })),
        },
      },
      select: waybillSelect,
    })

    return NextResponse.json(waybill, { status: 201 })
  } catch (err) {
    console.error('[waybills POST]', err)
    return NextResponse.json({ error: 'Failed to create waybill' }, { status: 500 })
  }
}
