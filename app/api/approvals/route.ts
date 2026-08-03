import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ApprovalStatus } from '@prisma/client'
import { applyBranchScope, isBranchFilterActive, requireBranchAccess } from '@/lib/branch/server'

/**
 * GET /api/approvals
 * List pending (and recently resolved) transaction approvals.
 * Requires: approve_transactions permission
 *
 * Query params:
 *   status: PENDING | APPROVED | REJECTED  (default: PENDING)
 *   limit:  number (default 50)
 *   countOnly: true to return just the visible count for the current branch scope
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'approve_transactions')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get('status')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
    const countOnly = searchParams.get('countOnly') === 'true'

    const validStatuses = Object.values(ApprovalStatus)
    const status = validStatuses.includes(statusParam as ApprovalStatus)
      ? (statusParam as ApprovalStatus)
      : ApprovalStatus.PENDING

    if (countOnly) {
      if (!isBranchFilterActive(context!)) {
        const total = await prisma.transactionApproval.count({
          where: {
            tenantId: context!.tenantId,
            status,
          },
        })

        return NextResponse.json({ total })
      }

      const approvals = await prisma.transactionApproval.findMany({
        where: {
          tenantId: context!.tenantId,
          status,
        },
        select: {
          saleId: true,
          stockAdjustmentId: true,
        },
      })

      const saleIds = approvals.map((approval) => approval.saleId).filter(Boolean) as string[]
      const adjustmentIds = approvals
        .map((approval) => approval.stockAdjustmentId)
        .filter(Boolean) as string[]

      const [visibleSales, visibleAdjustments] = await Promise.all([
        saleIds.length > 0
          ? prisma.sale.findMany({
              where: applyBranchScope(
                {
                  tenantId: context!.tenantId,
                  id: { in: saleIds },
                },
                context!
              ),
              select: { id: true },
            })
          : Promise.resolve([]),
        adjustmentIds.length > 0
          ? prisma.stockAdjustment.findMany({
              where: applyBranchScope(
                {
                  tenantId: context!.tenantId,
                  id: { in: adjustmentIds },
                },
                context!
              ),
              select: { id: true },
            })
          : Promise.resolve([]),
      ])

      const visibleSaleIds = new Set(visibleSales.map((sale) => sale.id))
      const visibleAdjustmentIds = new Set(visibleAdjustments.map((adjustment) => adjustment.id))
      const total = approvals.filter((approval) => {
        if (approval.saleId) return visibleSaleIds.has(approval.saleId)
        if (approval.stockAdjustmentId) return visibleAdjustmentIds.has(approval.stockAdjustmentId)
        return false
      }).length

      return NextResponse.json({ total })
    }

    // Branch filtering is applied in the query rather than after `take`.
    // Filtering afterwards meant `take` consumed the tenant-wide list first, so
    // with 200 approvals of which only 12 were in your branch you saw 12 — and
    // anything in your branch beyond the first 200 tenant-wide was invisible
    // and unactionable, with no way for the UI to detect the truncation.
    //
    // TransactionApproval has no relation to Sale or StockAdjustment (both are
    // loose id columns), so the visible ids are resolved first and matched by
    // id rather than joined.
    let branchFilter: Record<string, unknown> = {}
    if (isBranchFilterActive(context!)) {
      const [visibleSales, visibleAdjustments] = await Promise.all([
        prisma.sale.findMany({
          where: { tenantId: context!.tenantId, branchId: context!.currentBranchId },
          select: { id: true },
        }),
        prisma.stockAdjustment.findMany({
          where: { tenantId: context!.tenantId, branchId: context!.currentBranchId },
          select: { id: true },
        }),
      ])
      branchFilter = {
        OR: [
          { saleId: { in: visibleSales.map(s => s.id) } },
          { stockAdjustmentId: { in: visibleAdjustments.map(a => a.id) } },
        ],
      }
    }

    const approvals = await prisma.transactionApproval.findMany({
      where: {
        tenantId: context!.tenantId,
        status,
        ...branchFilter,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        approvedBy: { select: { id: true, name: true, role: true } },
        // Include sale snapshot
      },
    })

    // Enrich with sale details
    const saleIds = approvals.map(a => a.saleId).filter(Boolean) as string[]
    const sales = saleIds.length > 0 ? await prisma.sale.findMany({
      where: applyBranchScope(
        {
          tenantId: context!.tenantId,
          id: { in: saleIds },
        },
        context!
      ),
      include: {
        customer: { select: { id: true, name: true } },
        items: {
          include: { item: { select: { id: true, name: true } } },
          take: 5, // preview only
        },
      },
    }) : []

    const adjustmentIds = approvals
      .map(a => a.stockAdjustmentId)
      .filter(Boolean) as string[]

    const stockAdjustments = adjustmentIds.length > 0
      ? await prisma.stockAdjustment.findMany({
          where: applyBranchScope(
            {
              tenantId: context!.tenantId,
              id: { in: adjustmentIds },
            },
            context!
          ),
          include: {
            item: { select: { id: true, name: true } },
          },
        })
      : []

    const salesById = Object.fromEntries(sales.map(s => [s.id, s]))
    const adjustmentsById = Object.fromEntries(stockAdjustments.map(a => [a.id, a]))

    const enriched = approvals
      .map(a => ({
        ...a,
        sale: a.saleId ? salesById[a.saleId] ?? null : null,
        stockAdjustment: a.stockAdjustmentId ? adjustmentsById[a.stockAdjustmentId] ?? null : null,
      }))
      .filter((record) => {
        if (!isBranchFilterActive(context!)) return true
        if (record.saleId) return Boolean(record.sale)
        if (record.stockAdjustmentId) return Boolean(record.stockAdjustment)
        return false
      })

    return NextResponse.json({ approvals: enriched, total: enriched.length })
  } catch (err) {
    console.error('Failed to fetch approvals:', err)
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 })
  }
}
