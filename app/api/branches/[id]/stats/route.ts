import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/permissions/rbac'
import { requireBranchAccess } from '@/lib/branch/server'
import { approvedSaleWhere } from '@/lib/approvals/sales'

/**
 * GET /api/branches/[id]/stats
 * Get summary stats for a specific branch.
 * Optional query param: period (today | week | month | all). Defaults to today.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'manage_settings')
    if (!authorized) return permError!

    const { id } = await params
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || 'today'

    // Verify branch belongs to tenant
    const branch = await prisma.branch.findFirst({
      where: { id, tenantId: context!.tenantId },
    })
    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    // Build date filter
    let dateFrom: Date | undefined
    const now = new Date()
    if (period === 'today') {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (period === 'week') {
      dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (period === 'month') {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1)
    }

    const dateFilter = dateFrom ? { gte: dateFrom } : undefined

    const [salesAgg, purchaseAgg, expenseAgg, itemCount, lowStockCount, transferOutCount, transferInCount, pendingTransferCount] = await Promise.all([
      prisma.sale.aggregate({
        where: approvedSaleWhere({
          tenantId: context!.tenantId,
          branchId: id,
          ...(dateFilter && { createdAt: dateFilter }),
        }),
        _sum: { subtotalAmount: true, paidAmount: true },
        _count: true,
      }),
      prisma.purchase.aggregate({
        where: { tenantId: context!.tenantId, branchId: id, ...(dateFilter && { createdAt: dateFilter }) },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.expense.aggregate({
        where: { tenantId: context!.tenantId, branchId: id, ...(dateFilter && { createdAt: dateFilter }) },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.item.count({ where: { tenantId: context!.tenantId, branchId: id } }),
      prisma.item.count({ where: { tenantId: context!.tenantId, branchId: id, quantity: { lte: 10 } } }),
      prisma.stockTransfer.count({
        where: { tenantId: context!.tenantId, fromBranchId: id, ...(dateFilter && { createdAt: dateFilter }) },
      }),
      prisma.stockTransfer.count({
        where: { tenantId: context!.tenantId, toBranchId: id, ...(dateFilter && { createdAt: dateFilter }) },
      }),
      prisma.stockTransfer.count({
        where: {
          tenantId: context!.tenantId,
          status: 'PENDING',
          OR: [{ fromBranchId: id }, { toBranchId: id }],
          ...(dateFilter && { createdAt: dateFilter }),
        },
      }),
    ])

    return NextResponse.json({
      branch: { id: branch.id, name: branch.name },
      period,
      sales: {
        count: salesAgg._count,
        totalRevenue: salesAgg._sum.subtotalAmount ?? 0,
        totalPaid: salesAgg._sum.paidAmount ?? 0,
      },
      purchases: {
        count: purchaseAgg._count,
        totalAmount: purchaseAgg._sum.totalAmount ?? 0,
      },
      expenses: {
        count: expenseAgg._count,
        totalAmount: expenseAgg._sum.amount ?? 0,
      },
      inventory: {
        itemCount,
        lowStockCount,
      },
      transfers: {
        outCount: transferOutCount,
        inCount: transferInCount,
        pendingCount: pendingTransferCount,
      },
    })
  } catch (err) {
    console.error('Failed to fetch branch stats:', err)
    return NextResponse.json({ error: 'Failed to fetch branch stats' }, { status: 500 })
  }
}
