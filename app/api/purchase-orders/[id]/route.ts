import { NextResponse } from 'next/server'
import { PurchaseOrderStatus } from '@prisma/client'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import {
  isBranchFilterActive,
  requireBranchAccess,
  requireOperationalBranch,
} from '@/lib/branch/server'
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

    const { authorized, error: permError } = requirePermission(context!, 'view_purchase_orders')
    if (!authorized) return permError!

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

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before updating a purchase order.'
    )
    if (branchError) return branchError

    const { id } = await params
    const body = await req.json()

    const existing = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && branchId
          ? {
              OR: [{ branchId }, { branchId: null }],
            }
          : {}),
      },
      include: { items: true },
    })
    if (!existing) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

    const visibleOrderIds = await getVisiblePurchaseOrderIds(
      { ...context!, currentBranchId: branchId, allBranchesSelected: false },
      [existing]
    )
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

    // Transitions were unvalidated, so a cancelled order could be moved back to
    // DRAFT or SENT and then received.
    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      DRAFT:     ['SENT', 'CANCELLED'],
      SENT:      ['CANCELLED'],
      CANCELLED: [],
    }
    if (body.status && body.status !== existing.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status] ?? []
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { error: `Cannot change a ${existing.status} purchase order to ${body.status}.` },
          { status: 409 }
        )
      }
    }

    const shouldBackfillBranchId =
      context!.branchesEnabled && branchId && !existing.branchId

    // Scope the write by tenant/branch rather than trusting the prior read
    const updateResult = await prisma.purchaseOrder.updateMany({
      where: { id, tenantId: context!.tenantId },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.note !== undefined && { note: body.note }),
        ...(body.expectedAt !== undefined && {
          expectedAt: body.expectedAt ? new Date(body.expectedAt) : null,
        }),
        ...(shouldBackfillBranchId ? { branchId } : {}),
      },
    })
    if (updateResult.count !== 1) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    const order = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId: context!.tenantId },
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

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before deleting a purchase order.'
    )
    if (branchError) return branchError

    const { id } = await params

    const existing = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && branchId
          ? {
              OR: [{ branchId }, { branchId: null }],
            }
          : {}),
      },
      include: { items: true },
    })
    if (!existing) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

    const visibleOrderIds = await getVisiblePurchaseOrderIds(
      { ...context!, currentBranchId: branchId, allBranchesSelected: false },
      [existing]
    )
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
