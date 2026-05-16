import { NextResponse } from 'next/server'
import { PurchaseOrderStatus } from '@prisma/client'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { isBranchFilterActive, requireBranchAccess } from '@/lib/branch/server'
import { getVisiblePurchaseOrderIds } from '@/lib/purchase-orders/server'
import { requireTenantFeature } from '@/lib/tenant/features'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/purchase-orders/[id]
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(
      context!.features,
      'enablePurchaseOrders'
    )
    if (featureError) return featureError

    const { id } = await params

    if (isBranchFilterActive(context!) && !context!.currentBranchId) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        tenantId: context!.tenantId,
        ...(isBranchFilterActive(context!) && context!.currentBranchId
          ? {
              OR: [{ branchId: context!.currentBranchId }, { branchId: null }],
            }
          : {}),
      },
      include: { items: true },
    })

    if (!order) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

    const visibleOrderIds = await getVisiblePurchaseOrderIds(context!, [order])
    if (!visibleOrderIds.has(order.id)) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    let supplier = null
    if (order.supplierId) {
      supplier = await prisma.supplier.findFirst({
        where: { id: order.supplierId, tenantId: context!.tenantId },
        select: { id: true, name: true, phone: true },
      })
    }

    return NextResponse.json({ ...order, supplier })
  } catch (err) {
    console.error('Failed to fetch purchase order:', err)
    return NextResponse.json({ error: 'Failed to fetch purchase order' }, { status: 500 })
  }
}

/**
 * PATCH /api/purchase-orders/[id]
 * Update status / note / expectedAt
 */
export async function PATCH(req: Request, { params }: RouteParams) {
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

    const { id } = await params
    const body = await req.json()

    if (isBranchFilterActive(context!) && !context!.currentBranchId) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    const existing = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        tenantId: context!.tenantId,
        ...(isBranchFilterActive(context!) && context!.currentBranchId
          ? {
              OR: [{ branchId: context!.currentBranchId }, { branchId: null }],
            }
          : {}),
      },
      include: { items: true },
    })
    if (!existing) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

    const visibleOrderIds = await getVisiblePurchaseOrderIds(context!, [existing])
    if (!visibleOrderIds.has(existing.id)) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    if (
      body.status !== undefined &&
      !Object.values(PurchaseOrderStatus).includes(body.status)
    ) {
      return NextResponse.json({ error: 'Invalid purchase order status' }, { status: 400 })
    }

    if (body.status === PurchaseOrderStatus.RECEIVED) {
      return NextResponse.json(
        { error: 'Use the receive/convert action to mark a purchase order as received.' },
        { status: 400 }
      )
    }

    if (existing.status === PurchaseOrderStatus.RECEIVED) {
      return NextResponse.json(
        { error: 'Received purchase orders cannot be edited.' },
        { status: 409 }
      )
    }

    const shouldBackfillBranchId =
      context!.branchesEnabled && context!.currentBranchId && !existing.branchId

    const order = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.note !== undefined && { note: body.note }),
        ...(body.expectedAt !== undefined && {
          expectedAt: body.expectedAt ? new Date(body.expectedAt) : null,
        }),
        ...(shouldBackfillBranchId ? { branchId: context!.currentBranchId } : {}),
      },
    })

    return NextResponse.json(order)
  } catch (err) {
    console.error('Failed to update purchase order:', err)
    return NextResponse.json({ error: 'Failed to update purchase order' }, { status: 500 })
  }
}

/**
 * DELETE /api/purchase-orders/[id]
 * Only DRAFT orders can be deleted
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(
      context!.features,
      'enablePurchaseOrders'
    )
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'delete_purchase_order')
    if (!authorized) return permError!

    const { id } = await params

    if (isBranchFilterActive(context!) && !context!.currentBranchId) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    const existing = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        tenantId: context!.tenantId,
        ...(isBranchFilterActive(context!) && context!.currentBranchId
          ? {
              OR: [{ branchId: context!.currentBranchId }, { branchId: null }],
            }
          : {}),
      },
      include: { items: true },
    })
    if (!existing) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

    const visibleOrderIds = await getVisiblePurchaseOrderIds(context!, [existing])
    if (!visibleOrderIds.has(existing.id)) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    if (existing.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Only DRAFT purchase orders can be deleted' }, { status: 409 })
    }

    await prisma.purchaseOrder.delete({ where: { id } })

    return NextResponse.json({ message: 'Purchase order deleted' })
  } catch (err) {
    console.error('Failed to delete purchase order:', err)
    return NextResponse.json({ error: 'Failed to delete purchase order' }, { status: 500 })
  }
}
