import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import { approvedSaleWhere } from '@/lib/approvals/sales'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * Till / Cash Register API
 *
 * GET  /api/till          - Get current open shift (if any) + today's running totals
 * POST /api/till          - Open a new shift (openingFloat)
 * PUT  /api/till          - Close current shift (closingCount, note)
 */

/**
 * Physical cash expected in the drawer for a shift.
 *
 * Previously this filtered sales on `paymentType`, which is CASH vs CREDIT —
 * the settlement status, not the tender. Every MoMo and bank sale therefore
 * counted as drawer cash, manufacturing a shortage at every close, while a
 * partly-paid credit sale (real cash in the drawer) was excluded entirely.
 * The tender is `paymentMethod`.
 *
 * Cash refunds and cash supplier payments physically leave the drawer and were
 * not counted at all.
 *
 * Shared by GET and PUT so the figure the cashier sees and the figure that is
 * persisted at close cannot diverge.
 */
async function computeExpectedCash(
  tenantId: string,
  branchId: string | null,
  openingFloat: number,
  since: Date
) {
  const window = { gte: since }

  const [cashSales, cashPaymentsReceived, cashExpenses, cashRefunds, cashSupplierPayments] =
    await Promise.all([
      // Cash actually collected on sales — includes the cash portion of a
      // credit sale, which the old paymentType filter dropped.
      prisma.sale.aggregate({
        where: approvedSaleWhere({
          tenantId,
          branchId,
          paymentMethod: 'CASH',
          createdAt: window,
        }),
        _sum: { paidAmount: true },
      }),

      prisma.customerPayment.aggregate({
        where: { tenantId, branchId, method: 'CASH', createdAt: window },
        _sum: { amount: true },
      }),

      // Only cash-paid expenses leave the drawer
      prisma.expense.aggregate({
        where: { tenantId, branchId, method: 'CASH', createdAt: window },
        _sum: { amount: true },
      }),

      // Refunds handed back to customers in cash
      prisma.customerReturn.aggregate({
        where: { tenantId, type: 'CASH', createdAt: window },
        _sum: { amount: true },
      }),

      // Suppliers paid out of the drawer
      prisma.supplierPayment.aggregate({
        where: { tenantId, branchId, method: 'CASH', createdAt: window },
        _sum: { amount: true },
      }),
    ])

  const cashSalesTotal = cashSales._sum.paidAmount || 0
  const cashPaymentsTotal = cashPaymentsReceived._sum.amount || 0
  const cashExpensesTotal = cashExpenses._sum.amount || 0
  const cashRefundsTotal = cashRefunds._sum.amount || 0
  const cashSupplierPaymentsTotal = cashSupplierPayments._sum.amount || 0

  const cashIn = cashSalesTotal + cashPaymentsTotal
  const cashOut = cashExpensesTotal + cashRefundsTotal + cashSupplierPaymentsTotal

  return {
    openingFloat,
    cashSales: cashSalesTotal,
    cashPaymentsReceived: cashPaymentsTotal,
    cashExpenses: cashExpensesTotal,
    cashRefunds: cashRefundsTotal,
    cashSupplierPayments: cashSupplierPaymentsTotal,
    cashIn,
    cashOut,
    expectedCash: openingFloat + cashIn - cashOut,
  }
}

export async function GET() {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableTill')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'manage_till')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before opening or viewing a till shift.'
    )
    if (branchError) return branchError

    // Find the current user's open shift
    const openShift = await prisma.cashRegister.findFirst({
      where: { tenantId: context!.tenantId, branchId, userId: context!.user.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    })

    // Fetch today's shift history for this user
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayShifts = await prisma.cashRegister.findMany({
      where: { tenantId: context!.tenantId, branchId, userId: context!.user.id, openedAt: { gte: todayStart } },
      orderBy: { openedAt: 'desc' },
    })

    if (!openShift) {
      return NextResponse.json({ openShift: null, todayShifts, runningTotals: null })
    }

    const runningTotals = await computeExpectedCash(
      context!.tenantId,
      branchId,
      openShift.openingFloat,
      openShift.openedAt
    )

    return NextResponse.json({ openShift, todayShifts, runningTotals })
  } catch (err) {
    console.error('Till GET error:', err)
    return NextResponse.json({ error: 'Failed to load till data' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableTill')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'manage_till')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before opening a till shift.'
    )
    if (branchError) return branchError

    const body = await req.json()
    const openingFloat = parseFloat(body.openingFloat ?? 0)
    if (isNaN(openingFloat) || openingFloat < 0) {
      return NextResponse.json({ error: 'Opening float must be a non-negative number' }, { status: 400 })
    }

    // The duplicate check and the create must share a transaction. Previously
    // two concurrent opens both saw no existing shift and both created one,
    // leaving an orphan that could never be closed through the UI and that
    // double-counted the same branch takings.
    const shift = await prisma.$transaction(async (tx) => {
      const existing = await tx.cashRegister.findFirst({
        where: { tenantId: context!.tenantId, branchId, userId: context!.user.id, status: 'OPEN' },
        select: { id: true },
      })
      if (existing) {
        throw new Error('You already have an open shift. Close it first.')
      }

      return tx.cashRegister.create({
        data: {
          tenantId: context!.tenantId,
          branchId,
          userId: context!.user.id,
          openingFloat,
          status: 'OPEN',
        },
      })
    })

    return NextResponse.json(shift, { status: 201 })
  } catch (err) {
    console.error('Till POST error:', err)
    const message = err instanceof Error ? err.message : 'Failed to open shift'
    const isConflict = message.includes('already have an open shift')
    return NextResponse.json({ error: message }, { status: isConflict ? 409 : 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableTill')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'manage_till')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before closing a till shift.'
    )
    if (branchError) return branchError

    const openShift = await prisma.cashRegister.findFirst({
      where: { tenantId: context!.tenantId, branchId, userId: context!.user.id, status: 'OPEN' },
    })
    if (!openShift) {
      return NextResponse.json({ error: 'No open shift found' }, { status: 404 })
    }

    const body = await req.json()
    const closingCount = parseFloat(body.closingCount)
    if (isNaN(closingCount) || closingCount < 0) {
      return NextResponse.json({ error: 'Closing count must be a non-negative number' }, { status: 400 })
    }

    // Recalculate expected cash at close time using the same helper as GET
    const totals = await computeExpectedCash(
      context!.tenantId,
      branchId,
      openShift.openingFloat,
      openShift.openedAt
    )
    const expectedCash = totals.expectedCash
    const variance = closingCount - expectedCash

    // Conditional on the shift still being OPEN. The read above is outside any
    // transaction, so an unconditional update-by-id let a second request
    // silently rewrite the closing count, variance and note of an
    // already-closed shift.
    const closeResult = await prisma.cashRegister.updateMany({
      where: {
        id: openShift.id,
        tenantId: context!.tenantId,
        status: 'OPEN',
      },
      data: {
        status: 'CLOSED',
        closingCount,
        expectedCash,
        variance,
        note: body.note?.trim() || null,
        closedAt: new Date(),
      },
    })
    if (closeResult.count !== 1) {
      return NextResponse.json(
        { error: 'This shift has already been closed.' },
        { status: 409 }
      )
    }

    const closed = await prisma.cashRegister.findFirst({ where: { id: openShift.id } })
    return NextResponse.json(closed)
  } catch (err) {
    console.error('Till PUT error:', err)
    return NextResponse.json({ error: 'Failed to close shift' }, { status: 500 })
  }
}
