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

    const validStatuses = Object.values(ApprovalStatus)
    const status = validStatuses.includes(statusParam as ApprovalStatus)
      ? (statusParam as ApprovalStatus)
      : ApprovalStatus.PENDING

    const approvals = await prisma.transactionApproval.findMany({
      where: {
        tenantId: context!.tenantId,
        status,
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
