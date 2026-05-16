import { NextResponse } from 'next/server'
import { hasPermission, requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ApprovalFlag, ApprovalStatus, StockAdjustmentType } from '@prisma/client'
import { applyBranchScope, requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import { postStockAdjustmentJournal } from '@/lib/accounting/journalEngine'

/**
 * GET /api/adjustments  — List stock adjustments with filters + summary
 * POST /api/adjustments — Create manual stock adjustment (adjust_stock permission)
 */

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const itemId    = searchParams.get('itemId')
    const type      = searchParams.get('type')
    const category  = searchParams.get('category')
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = applyBranchScope({ tenantId: context!.tenantId }, context!)

    if (itemId)    where.itemId = itemId
    if (category)  where.category = category
    if (type && Object.values(StockAdjustmentType).includes(type as StockAdjustmentType)) {
      where.type = type as StockAdjustmentType
    }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.createdAt.lte = end
      }
    }

    const adjustments = await prisma.stockAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        item: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    })

    const appliedAdjustments = adjustments.filter(
      (adjustment) => adjustment.approvalStatus !== ApprovalStatus.PENDING && adjustment.approvalStatus !== ApprovalStatus.REJECTED
    )

    const totalIncrease = appliedAdjustments
      .filter(a => a.type === StockAdjustmentType.INCREASE)
      .reduce((sum, a) => sum + a.quantity, 0)

    const totalDecrease = appliedAdjustments
      .filter(a => a.type === StockAdjustmentType.DECREASE)
      .reduce((sum, a) => sum + a.quantity, 0)

    return NextResponse.json({
      adjustments,
      summary: {
        total: adjustments.length,
        applied: appliedAdjustments.length,
        pending: adjustments.filter(a => a.approvalStatus === ApprovalStatus.PENDING).length,
        totalIncrease,
        totalDecrease,
        netChange: totalIncrease - totalDecrease,
      },
    })
  } catch (err) {
    console.error('Failed to fetch stock adjustments:', err)
    return NextResponse.json({ error: 'Failed to fetch stock adjustments' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'adjust_stock')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before creating a stock adjustment.'
    )
    if (branchError) return branchError

    const body = await req.json()

    if (!body.itemId || typeof body.itemId !== 'string') {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }
    if (!body.type || !Object.values(StockAdjustmentType).includes(body.type)) {
      return NextResponse.json(
        { error: 'Valid adjustment type is required (INCREASE or DECREASE)' },
        { status: 400 }
      )
    }
    const quantity = Number(body.quantity)
    if (!quantity || isNaN(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 })
    }
    if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length < 3) {
      return NextResponse.json({ error: 'Reason is required for stock adjustments' }, { status: 400 })
    }

    const item = await prisma.item.findFirst({
      where: {
        id: body.itemId,
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled ? { branchId } : {}),
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found or does not belong to your tenant' }, { status: 404 })
    }

    if (item.itemType !== 'INVENTORY') {
      return NextResponse.json(
        { error: `Stock adjustments are only available for inventory items. "${item.name}" is a ${item.itemType.replace('_', ' ').toLowerCase()} item.` },
        { status: 400 }
      )
    }

    if (body.type === StockAdjustmentType.DECREASE && item.quantity < quantity) {
      return NextResponse.json(
        {
          error: 'Insufficient stock for decrease adjustment',
          currentStock: item.quantity,
          requestedDecrease: quantity,
        },
        { status: 400 }
      )
    }

    const newQuantity =
      body.type === StockAdjustmentType.INCREASE
        ? item.quantity + quantity
        : item.quantity - quantity

    const tenantSettings = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { enableAccounting: true, requireApproval: true },
    })
    const accountingEnabled = tenantSettings?.enableAccounting ?? false
    const canSelfApprove = hasPermission(context!, 'approve_transactions')
    const needsApproval = (tenantSettings?.requireApproval ?? false) && !canSelfApprove

    if (needsApproval) {
      const pendingAdjustment = await prisma.$transaction(async (tx) => {
        const adjustment = await tx.stockAdjustment.create({
          data: {
            tenantId: context!.tenantId,
            ...(context!.branchesEnabled ? { branchId } : {}),
            itemId: body.itemId,
            userId: context!.user.id,
            type: body.type as StockAdjustmentType,
            category: body.category || 'other',
            quantity,
            previousQuantity: item.quantity,
            newQuantity,
            reason: body.reason.trim(),
            approvalStatus: ApprovalStatus.PENDING,
          },
        })

        await tx.transactionApproval.create({
          data: {
            tenantId: context!.tenantId,
            flag: ApprovalFlag.STOCK_ADJUSTMENT,
            status: ApprovalStatus.PENDING,
            stockAdjustmentId: adjustment.id,
            createdById: context!.user.id,
          },
        })

        return adjustment
      })

      return NextResponse.json(
        {
          requiresApproval: true,
          adjustmentId: pendingAdjustment.id,
          message: 'This stock adjustment requires manager approval before it takes effect.',
        },
        { status: 202 }
      )
    }

    const adjustment = await prisma.$transaction(async (tx) => {
      const lockedItem = await tx.item.findFirst({
        where: {
          id: body.itemId,
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled ? { branchId } : {}),
        },
        select: { costPrice: true, quantity: true, itemType: true },
      })
      if (!lockedItem) throw new Error('Item not found')
      if (lockedItem.itemType !== 'INVENTORY') {
        throw new Error('Stock adjustments are only available for inventory items.')
      }
      if (body.type === StockAdjustmentType.DECREASE && lockedItem.quantity < quantity) {
        throw new Error(`Insufficient stock for decrease adjustment. Current stock: ${lockedItem.quantity}`)
      }

      const nextQuantity =
        body.type === StockAdjustmentType.INCREASE
          ? lockedItem.quantity + quantity
          : lockedItem.quantity - quantity

      const newAdjustment = await tx.stockAdjustment.create({
        data: {
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled ? { branchId } : {}),
          itemId: body.itemId,
          userId: context!.user.id,
          type: body.type as StockAdjustmentType,
          category: body.category || 'other',
          quantity,
          previousQuantity: lockedItem.quantity,
          newQuantity: nextQuantity,
          reason: body.reason.trim(),
        },
      })

      await tx.item.update({
        where: { id: body.itemId },
        data: {
          quantity:
            body.type === StockAdjustmentType.INCREASE
              ? { increment: quantity }
              : { decrement: quantity },
        },
      })

      if (accountingEnabled) {
        await postStockAdjustmentJournal(tx, {
          tenantId: context!.tenantId,
          stockAdjustmentId: newAdjustment.id,
          postedById: context!.user.id,
          adjustmentType: body.type as StockAdjustmentType,
          quantity,
          itemCostPrice: lockedItem.costPrice,
        })
      }

      return newAdjustment
    })

    const updatedItem = await prisma.item.findUnique({ where: { id: body.itemId } })

    return NextResponse.json(
      {
        adjustment,
        item: {
          id: updatedItem?.id,
          name: updatedItem?.name,
          previousQuantity: item.quantity,
          newQuantity: updatedItem?.quantity,
          change: body.type === StockAdjustmentType.INCREASE ? quantity : -quantity,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Failed to create stock adjustment:', err)
    const message = err instanceof Error ? err.message : 'Failed to create stock adjustment'
    const status =
      message === 'Item not found'
        ? 404
        : message.includes('Insufficient stock') || message.includes('inventory items')
          ? 400
          : 500
    return NextResponse.json({ error: message }, { status })
  }
}
