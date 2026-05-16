import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ApprovalStatus } from '@prisma/client'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'

/**
 * POST /api/approvals/stock/[id]/reject
 * Reject a pending stock adjustment — no quantity change applied.
 * Requires: approve_transactions permission
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'approve_transactions')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const note: string | undefined = body.note

    const adjustmentWhere = applyBranchScope(
      { id, tenantId: context!.tenantId, approvalStatus: ApprovalStatus.PENDING },
      context!
    )

    const adjustment = await prisma.stockAdjustment.findFirst({
      where: adjustmentWhere,
    })

    if (!adjustment) {
      return NextResponse.json({ error: 'Pending adjustment not found' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      const rejected = await tx.stockAdjustment.updateMany({
        where: adjustmentWhere,
        data: { approvalStatus: ApprovalStatus.REJECTED },
      })
      if (rejected.count !== 1) {
        throw new Error('This adjustment is no longer pending approval.')
      }

      await tx.transactionApproval.updateMany({
        where: { stockAdjustmentId: id, status: ApprovalStatus.PENDING },
        data: {
          status: ApprovalStatus.REJECTED,
          approvedById: context!.user.id,
          approvedAt: new Date(),
          ...(note ? { note } : {}),
        },
      })
    })

    return NextResponse.json({ rejected: true, adjustmentId: id })
  } catch (err) {
    console.error('Failed to reject adjustment:', err)
    const message = err instanceof Error ? err.message : 'Failed to reject adjustment'
    const status = message.includes('pending approval') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
