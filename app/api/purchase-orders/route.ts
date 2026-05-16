import { NextResponse } from 'next/server'
import type { PurchaseOrderStatus } from '@prisma/client'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import {
  isBranchFilterActive,
  requireBranchAccess,
  requireOperationalBranch,
} from '@/lib/branch/server'
import { getVisiblePurchaseOrderIds } from '@/lib/purchase-orders/server'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/purchase-orders
 * List purchase orders for tenant with optional status filter
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(
      context!.features,
      'enablePurchaseOrders'
    )
    if (featureError) return featureError

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')?.trim() || null

    if (isBranchFilterActive(context!) && !context!.currentBranchId) {
      return NextResponse.json([])
    }

    const orders = await prisma.purchaseOrder.findMany({
      where: {
        tenantId: context!.tenantId,
        ...(status ? { status: status as PurchaseOrderStatus } : {}),
        ...(isBranchFilterActive(context!) && context!.currentBranchId
          ? {
              OR: [{ branchId: context!.currentBranchId }, { branchId: null }],
            }
          : {}),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    })
    const visibleOrderIds = await getVisiblePurchaseOrderIds(context!, orders)
    const visibleOrders = orders.filter((order) => visibleOrderIds.has(order.id))

    // Join supplier names manually (no Prisma relation)
    const supplierIds = [...new Set(visibleOrders.map(o => o.supplierId).filter(Boolean))] as string[]
    const suppliers = supplierIds.length
      ? await prisma.supplier.findMany({ where: { id: { in: supplierIds }, tenantId: context!.tenantId }, select: { id: true, name: true } })
      : []
    const supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s]))

    const result = visibleOrders.map(o => ({
      ...o,
      supplier: o.supplierId ? supplierMap[o.supplierId] ?? null : null,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('Failed to fetch purchase orders:', err)
    return NextResponse.json({ error: 'Failed to fetch purchase orders' }, { status: 500 })
  }
}

/**
 * POST /api/purchase-orders
 * Create a new purchase order
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(
      context!.features,
      'enablePurchaseOrders'
    )
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'create_purchase_order')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before creating a purchase order.'
    )
    if (branchError) return branchError

    const body = await req.json()

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    // Snapshot item names
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemIds = body.items.map((i: any) => i.itemId)
    const items = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled ? { branchId } : {}),
      },
      select: { id: true, name: true },
    })
    const itemMap = Object.fromEntries(items.map(i => [i.id, i]))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderItems = body.items.map((i: any) => {
      const item = itemMap[i.itemId]
      if (!item) throw new Error(`Item not found: ${i.itemId}`)
      return {
        itemId: i.itemId,
        itemName: item.name,
        quantity: parseFloat(i.quantity) || 1,
        costPrice: parseFloat(i.costPrice) || 0,
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalAmount = orderItems.reduce((s: number, i: any) => s + i.quantity * i.costPrice, 0)

    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.purchaseOrder.create({
        data: {
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled ? { branchId } : {}),
          supplierId: body.supplierId || null,
          status: 'DRAFT',
          totalAmount,
          note: body.note || null,
          expectedAt: body.expectedAt ? new Date(body.expectedAt) : null,
          items: { create: orderItems },
        },
        include: { items: true },
      })

      return createdOrder
    })

    return NextResponse.json(order, { status: 201 })
  } catch (err) {
    console.error('Failed to create purchase order:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create purchase order' }, { status: 500 })
  }
}
