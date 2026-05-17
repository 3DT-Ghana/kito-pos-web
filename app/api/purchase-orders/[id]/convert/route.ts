import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import {
  requireBranchAccess,
  requireOperationalBranch,
} from '@/lib/branch/server'
import { getVisiblePurchaseOrderIds } from '@/lib/purchase-orders/server'
import { requireTenantFeature } from '@/lib/tenant/features'
import {
  createPurchaseFromInput,
  PurchaseOperationError,
} from '@/lib/purchases/createPurchase'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/purchase-orders/[id]/convert
 * Convert a purchase order into an actual purchase (receiving goods).
 * Marks order as RECEIVED, creates Purchase + PurchaseItems, increments stock.
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(
      context!.features,
      'enablePurchaseOrders'
    )
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'create_purchase')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before converting a purchase order into a purchase.'
    )
    if (branchError) return branchError

    const { id } = await params
    const body = await req.json()

    const order = await prisma.purchaseOrder.findFirst({
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

    if (!order) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

    const visibleOrderIds = await getVisiblePurchaseOrderIds(
      { ...context!, currentBranchId: branchId, allBranchesSelected: false },
      [order]
    )
    if (!visibleOrderIds.has(order.id)) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    if (order.status === 'RECEIVED') {
      return NextResponse.json({ error: 'Purchase order has already been received' }, { status: 409 })
    }
    if (order.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot receive a cancelled purchase order' }, { status: 409 })
    }
    if (!order.supplierId) {
      return NextResponse.json({ error: 'A supplier must be set before receiving' }, { status: 400 })
    }

    const purchase = await createPurchaseFromInput({
      context: context!,
      branchId,
      body: {
        supplierId: order.supplierId,
        paidAmount: body.paidAmount,
        paymentMethod: body.paymentMethod,
        sourcePurchaseOrderId: order.id,
        items: order.items.map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity,
          costPrice: item.costPrice,
        })),
      },
    })

    return NextResponse.json(purchase)
  } catch (err) {
    if (err instanceof PurchaseOperationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error('Failed to convert purchase order:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to convert purchase order' }, { status: 500 })
  }
}
