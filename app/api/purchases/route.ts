import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { PaymentType } from '@prisma/client'
import { applyBranchScope, requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import {
  createPurchaseFromInput,
  PurchaseOperationError,
} from '@/lib/purchases/createPurchase'

/**
 * Purchases API Routes
 *
 * GET /api/purchases - List all purchases
 * POST /api/purchases - Create new purchase with atomic transaction
 */

/**
 * GET /api/purchases
 * List all purchases for the current tenant
 * Optional query params: supplierId, paymentType, startDate, endDate
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Purchase records expose supplier spend; gate reads like other financial data.
    const { authorized, error: permError } = requirePermission(context!, 'view_basic_reports')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const supplierId = searchParams.get('supplierId')
    const paymentType = searchParams.get('paymentType')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = applyBranchScope({ tenantId: context!.tenantId }, context!)

    if (supplierId) {
      where.supplierId = supplierId
    }

    if (paymentType) {
      where.paymentType = paymentType as PaymentType
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
    }

    const purchases = await prisma.purchase.findMany({
      where,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Calculate summary
    const summary = {
      total: purchases.length,
      totalAmount: purchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
      totalPaid: purchases.reduce((sum, purchase) => sum + purchase.paidAmount, 0),
      totalCredit: purchases.reduce(
        (sum, purchase) => sum + (purchase.totalAmount - purchase.paidAmount),
        0
      ),
    }

    return NextResponse.json({ purchases, summary })
  } catch (err) {
    console.error('Failed to fetch purchases:', err)
    return NextResponse.json(
      { error: 'Failed to fetch purchases' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/purchases
 * Create a new purchase with atomic transaction
 * Requires: create_purchase permission
 *
 * Atomically:
 * 1. Creates purchase record
 * 2. Creates purchase items
 * 3. Increases item stock
 * 4. Updates supplier balance (if credit purchase)
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'create_purchase')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before recording a purchase.'
    )
    if (branchError) return branchError

    const body = await req.json()
    const purchase = await createPurchaseFromInput({
      context: context!,
      branchId,
      body,
    })

    return NextResponse.json(purchase, { status: 201 })
  } catch (err) {
    if (err instanceof PurchaseOperationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error('Failed to create purchase:', err)
    return NextResponse.json(
      { error: 'Failed to create purchase' },
      { status: 500 }
    )
  }
}
