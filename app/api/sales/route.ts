import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { PaymentType } from '@prisma/client'
import { applyBranchScope, requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import { approvedSaleWhere } from '@/lib/approvals/sales'
import {
  createSaleFromInput,
  SaleOperationError,
} from '@/lib/sales/createSale'

/**
 * Sales API Routes
 *
 * GET /api/sales - List all sales
 * POST /api/sales - Create new sale with atomic transaction
 */

/**
 * GET /api/sales
 * List all sales for the current tenant
 * Optional query params: customerId, paymentType, startDate, endDate
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId')
    const paymentType = searchParams.get('paymentType')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const search = searchParams.get('search')?.trim() ?? ''
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10) || 500, 500)
    // Pending sales are hidden by default. Without this the cashier who
    // submitted a flagged sale watched it vanish from the list entirely.
    const includePending = searchParams.get('includePending') === 'true'

    // Build where clause
    const branchScoped = applyBranchScope({ tenantId: context!.tenantId }, context!)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = includePending ? { ...branchScoped } : approvedSaleWhere(branchScoped)

    if (customerId) {
      where.customerId = customerId
    }

    if (paymentType) {
      where.paymentType = paymentType as PaymentType
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
    }

    if (search) {
      where.OR = [
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { id: { contains: search, mode: 'insensitive' } },
      ]
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        customer: {
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
      take: limit,
    })

    // Fetch approval statuses for all returned sales in one query
    const saleIds = sales.map(s => s.id)
    const approvalMap = new Map<string, string>()
    if (saleIds.length > 0) {
      const approvals = await prisma.transactionApproval.findMany({
        where: { tenantId: context!.tenantId, saleId: { in: saleIds } },
        select: { saleId: true, status: true },
        orderBy: { createdAt: 'desc' },
      })
      for (const a of approvals) {
        if (a.saleId && !approvalMap.has(a.saleId)) approvalMap.set(a.saleId, a.status)
      }
    }

    // Calculate summary
    const summary = {
      total: sales.length,
      totalAmount: sales.reduce((sum, sale) => sum + sale.totalAmount, 0),
      totalPaid: sales.reduce((sum, sale) => sum + sale.paidAmount, 0),
      totalCredit: sales.reduce(
        (sum, sale) => sum + (sale.totalAmount - sale.paidAmount),
        0
      ),
    }

    const salesWithApproval = sales.map(s => ({
      ...s,
      approvalStatus: approvalMap.get(s.id) ?? s.approvalStatus ?? null,
    }))

    return NextResponse.json({ sales: salesWithApproval, summary })
  } catch (err) {
    console.error('Failed to fetch sales:', err)
    return NextResponse.json(
      { error: 'Failed to fetch sales' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/sales
 * Create a new sale with atomic transaction
 * Requires: create_sale permission
 *
 * Atomically:
 * 1. Creates sale record
 * 2. Creates sale items
 * 3. Reduces item stock
 * 4. Updates customer balance (if credit sale)
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'create_sale')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before recording a sale.'
    )
    if (branchError) return branchError

    const body = await req.json()
    const result = await createSaleFromInput({
      context: context!,
      branchId,
      body,
    })

    if (result.status === 'pending') {
      return NextResponse.json(
        {
          requiresApproval: true,
          saleId: result.saleId,
          flags: result.flags,
          message: 'This transaction requires manager approval before it can be completed.',
        },
        { status: 202 }
      )
    }

    return NextResponse.json(result.sale, { status: 201 })
  } catch (err) {
    if (err instanceof SaleOperationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error('Failed to create sale:', err)
    return NextResponse.json(
      { error: 'Failed to create sale' },
      { status: 500 }
    )
  }
}
