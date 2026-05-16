import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ApprovalStatus } from '@prisma/client'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'

/**
 * POST /api/sales/[id]/reject
 * Reject a pending sale — marks it REJECTED, no side effects are applied.
 * Requires: approve_transactions permission
 *
 * Body (optional):
 *   note: string
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

    const saleWhere = applyBranchScope(
      { id, tenantId: context!.tenantId, approvalStatus: ApprovalStatus.PENDING },
      context!
    )

    const sale = await prisma.sale.findFirst({ where: saleWhere })

    if (!sale) {
      return NextResponse.json({ error: 'Pending sale not found' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      const rejected = await tx.sale.updateMany({
        where: saleWhere,
        data: { approvalStatus: ApprovalStatus.REJECTED },
      })
      if (rejected.count !== 1) {
        throw new Error('This sale is no longer pending approval.')
      }

      await tx.transactionApproval.updateMany({
        where: { saleId: id, status: ApprovalStatus.PENDING },
        data: {
          status: ApprovalStatus.REJECTED,
          approvedById: context!.user.id,
          approvedAt: new Date(),
          ...(note ? { note } : {}),
        },
      })
    })

    return NextResponse.json({ rejected: true, saleId: id })
  } catch (err) {
    console.error('Failed to reject sale:', err)
    const message = err instanceof Error ? err.message : 'Failed to reject sale'
    const status = message.includes('pending approval') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
