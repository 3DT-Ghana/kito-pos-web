import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ApprovalStatus } from '@prisma/client'
import { postStockAdjustmentJournal } from '@/lib/accounting/journalEngine'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'

/**
 * POST /api/approvals/stock/[id]/approve
 * Approve a pending stock adjustment — commits the quantity change.
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
      include: {
        item: {
          select: {
            id: true,
            name: true,
            costPrice: true,
            itemType: true,
          },
        },
      },
    })

    if (!adjustment) {
      return NextResponse.json({ error: 'Pending adjustment not found' }, { status: 404 })
    }

    if (adjustment.item.itemType !== 'INVENTORY') {
      return NextResponse.json(
        { error: 'Only inventory stock adjustments can be approved.' },
        { status: 400 }
      )
    }

    const tenantSettings = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { enableAccounting: true },
    })
    const accountingEnabled = tenantSettings?.enableAccounting ?? false

    await prisma.$transaction(async (tx) => {
      const approved = await tx.stockAdjustment.updateMany({
        where: adjustmentWhere,
        data: { approvalStatus: ApprovalStatus.APPROVED },
      })
      if (approved.count !== 1) {
        throw new Error('This adjustment is no longer pending approval.')
      }

      const itemUpdate =
        adjustment.type === 'INCREASE'
          ? await tx.item.updateMany({
              where: {
                id: adjustment.itemId,
                tenantId: context!.tenantId,
                ...(adjustment.branchId ? { branchId: adjustment.branchId } : {}),
              },
              data: { quantity: { increment: adjustment.quantity } },
            })
          : await tx.item.updateMany({
              where: {
                id: adjustment.itemId,
                tenantId: context!.tenantId,
                ...(adjustment.branchId ? { branchId: adjustment.branchId } : {}),
                quantity: { gte: adjustment.quantity },
              },
              data: { quantity: { decrement: adjustment.quantity } },
            })

      if (itemUpdate.count !== 1) {
        throw new Error(`Insufficient stock to approve adjustment for "${adjustment.item.name}".`)
      }

      if (accountingEnabled) {
        await postStockAdjustmentJournal(tx, {
          tenantId: context!.tenantId,
          stockAdjustmentId: id,
          postedById: context!.user.id,
          adjustmentType: adjustment.type,
          quantity: adjustment.quantity,
          itemCostPrice: adjustment.item.costPrice,
        })
      }

      // Update the approval record
      await tx.transactionApproval.updateMany({
        where: { stockAdjustmentId: id, status: ApprovalStatus.PENDING },
        data: {
          status: ApprovalStatus.APPROVED,
          approvedById: context!.user.id,
          approvedAt: new Date(),
          ...(note ? { note } : {}),
        },
      })
    })

    return NextResponse.json({ approved: true, adjustmentId: id })
  } catch (err) {
    console.error('Failed to approve adjustment:', err)
    const message = err instanceof Error ? err.message : 'Failed to approve adjustment'
    const status = message.includes('pending approval') ? 409 : message.includes('Insufficient stock') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
