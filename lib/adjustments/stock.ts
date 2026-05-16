import { ApprovalFlag, ApprovalStatus, StockAdjustmentType } from '@prisma/client'
import { hasPermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { type BranchAccessContext, applyBranchScope } from '@/lib/branch/server'
import { postStockAdjustmentJournal } from '@/lib/accounting/journalEngine'
import { createAuditLog } from '@/lib/audit/auditLog'

export class StockAdjustmentError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'StockAdjustmentError'
  }
}

export interface StockAdjustmentInput {
  itemId: string
  type: 'add' | 'remove' | 'set'
  quantity: number
  category?: string
  reason: string
}

export interface StockAdjustmentPendingResult {
  status: 'pending'
  adjustmentId: string
  previousQuantity: number
  newQuantity: number
}

export interface StockAdjustmentAppliedResult {
  status: 'applied'
  adjustmentId: string
  previousQuantity: number
  newQuantity: number
  updatedItem: Awaited<ReturnType<typeof prisma.item.update>>
}

export type StockAdjustmentResult =
  | StockAdjustmentPendingResult
  | StockAdjustmentAppliedResult

export async function processStockAdjustment(
  context: BranchAccessContext,
  input: StockAdjustmentInput
): Promise<StockAdjustmentResult> {
  if (!['add', 'remove', 'set'].includes(input.type)) {
    throw new StockAdjustmentError('type must be one of: add, remove, set', 400)
  }

  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new StockAdjustmentError('quantity must be a non-negative number', 400)
  }

  if (input.type !== 'set' && input.quantity === 0) {
    throw new StockAdjustmentError(
      'quantity must be greater than 0 for add/remove adjustments',
      400
    )
  }

  if (!input.reason || input.reason.trim().length < 3) {
    throw new StockAdjustmentError(
      'A reason is required for stock adjustments',
      400
    )
  }

  const item = await prisma.item.findFirst({
    where: applyBranchScope(
      { id: input.itemId, tenantId: context.tenantId },
      context
    ),
  })

  if (!item) {
    throw new StockAdjustmentError('Item not found', 404)
  }

  if (item.itemType !== 'INVENTORY') {
    throw new StockAdjustmentError(
      `Stock adjustments are only available for inventory items. "${item.name}" is a ${item.itemType.replace('_', ' ').toLowerCase()} item.`,
      400
    )
  }

  let newQuantity = item.quantity
  if (input.type === 'add') {
    newQuantity = item.quantity + input.quantity
  } else if (input.type === 'remove') {
    newQuantity = item.quantity - input.quantity
    if (newQuantity < 0) {
      throw new StockAdjustmentError(
        `Cannot remove ${input.quantity} units — only ${item.quantity} in stock`,
        400
      )
    }
  } else {
    newQuantity = input.quantity
  }

  const adjustmentType =
    newQuantity >= item.quantity
      ? StockAdjustmentType.INCREASE
      : StockAdjustmentType.DECREASE
  const adjustedQty = Math.abs(newQuantity - item.quantity)

  const canSelfApprove = hasPermission(context, 'approve_transactions')
  const needsApproval = context.features.requireApproval && !canSelfApprove

  if (needsApproval) {
    const adjustment = await prisma.$transaction(async (tx) => {
      const createdAdjustment = await tx.stockAdjustment.create({
        data: {
          tenantId: context.tenantId,
          ...(context.branchesEnabled && context.currentBranchId
            ? { branchId: context.currentBranchId }
            : {}),
          itemId: input.itemId,
          userId: context.user.id,
          type: adjustmentType,
          category: input.category || 'other',
          quantity: adjustedQty,
          previousQuantity: item.quantity,
          newQuantity,
          reason: input.reason.trim(),
          approvalStatus: ApprovalStatus.PENDING,
        },
      })

      await tx.transactionApproval.create({
        data: {
          tenantId: context.tenantId,
          flag: ApprovalFlag.STOCK_ADJUSTMENT,
          status: ApprovalStatus.PENDING,
          stockAdjustmentId: createdAdjustment.id,
          createdById: context.user.id,
        },
      })

      return createdAdjustment
    })

    const response: StockAdjustmentPendingResult = {
      status: 'pending',
      adjustmentId: adjustment.id,
      previousQuantity: item.quantity,
      newQuantity,
    }

    void createAuditLog({
      tenantId: context.tenantId,
      userId: context.user.id,
      action: 'CREATE',
      entity: 'StockAdjustment',
      entityId: response.adjustmentId,
      details: {
        itemId: input.itemId,
        status: response.status,
        previousQuantity: response.previousQuantity,
        newQuantity: response.newQuantity,
      },
    })

    return response
  }

  const result = await prisma.$transaction(async (tx) => {
    const lockedItem = await tx.item.findFirst({
      where: applyBranchScope(
        { id: input.itemId, tenantId: context.tenantId },
        context
      ),
      select: {
        id: true,
        quantity: true,
        costPrice: true,
        itemType: true,
      },
    })

    if (!lockedItem) {
      throw new StockAdjustmentError('Item not found', 404)
    }

    if (lockedItem.itemType !== 'INVENTORY') {
      throw new StockAdjustmentError(
        'Stock adjustments are only available for inventory items.',
        400
      )
    }

    let committedNewQuantity = lockedItem.quantity
    if (input.type === 'add') {
      committedNewQuantity = lockedItem.quantity + input.quantity
    } else if (input.type === 'remove') {
      if (lockedItem.quantity < input.quantity) {
        throw new StockAdjustmentError(
          `Cannot remove ${input.quantity} units — only ${lockedItem.quantity} in stock`,
          400
        )
      }
      committedNewQuantity = lockedItem.quantity - input.quantity
    } else {
      committedNewQuantity = input.quantity
    }

    const committedAdjustmentType =
      committedNewQuantity >= lockedItem.quantity
        ? StockAdjustmentType.INCREASE
        : StockAdjustmentType.DECREASE
    const committedAdjustedQty = Math.abs(
      committedNewQuantity - lockedItem.quantity
    )

    const updatedItem = await tx.item.update({
      where: { id: input.itemId },
      data: {
        quantity:
          input.type === 'add'
            ? { increment: input.quantity }
            : input.type === 'remove'
              ? { decrement: input.quantity }
              : committedNewQuantity,
      },
      include: { manufacturer: { select: { name: true } } },
    })

    const adjustment = await tx.stockAdjustment.create({
      data: {
        tenantId: context.tenantId,
        ...(context.branchesEnabled && context.currentBranchId
          ? { branchId: context.currentBranchId }
          : {}),
        itemId: input.itemId,
        userId: context.user.id,
        type: committedAdjustmentType,
        category: input.category || 'other',
        quantity: committedAdjustedQty,
        previousQuantity: lockedItem.quantity,
        newQuantity: committedNewQuantity,
        reason: input.reason.trim(),
      },
    })

    if (context.features.enableAccounting) {
      await postStockAdjustmentJournal(tx, {
        tenantId: context.tenantId,
        stockAdjustmentId: adjustment.id,
        postedById: context.user.id,
        adjustmentType: committedAdjustmentType,
        quantity: committedAdjustedQty,
        itemCostPrice: lockedItem.costPrice,
      })
    }

    return {
      adjustmentId: adjustment.id,
      previousQuantity: lockedItem.quantity,
      newQuantity: committedNewQuantity,
      updatedItem,
    }
  })

  const response: StockAdjustmentAppliedResult = {
    status: 'applied',
    ...result,
  }

  void createAuditLog({
    tenantId: context.tenantId,
    userId: context.user.id,
    action: 'CREATE',
    entity: 'StockAdjustment',
    entityId: response.adjustmentId,
    details: {
      itemId: input.itemId,
      status: response.status,
      previousQuantity: response.previousQuantity,
      newQuantity: response.newQuantity,
    },
  })

  return response
}
