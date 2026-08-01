import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ReturnType } from '@prisma/client'
import {
  requireBranchAccess,
  requireOperationalBranch,
} from '@/lib/branch/server'
import { postSupplierReturnJournal } from '@/lib/accounting/journalEngine'

/**
 * Supplier Returns API
 *
 * GET /api/returns/suppliers - List all supplier returns
 * POST /api/returns/suppliers - Process supplier return (return to supplier)
 */

/**
 * GET /api/returns/suppliers
 * List all supplier returns
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const purchaseId = searchParams.get('purchaseId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: context!.tenantId }

    if (purchaseId) {
      where.purchaseId = purchaseId
    }

    if (context!.branchesEnabled && !context!.allBranchesSelected) {
      where.purchase = { branchId: context!.currentBranchId }
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
    }

    const returns = await prisma.supplierReturn.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        item: { select: { id: true, name: true } },
        purchase: {
          select: {
            id: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    })

    const totalAmount = returns.reduce((sum, r) => sum + r.amount, 0)

    return NextResponse.json({
      returns,
      summary: {
        total: returns.length,
        totalAmount,
      },
    })
  } catch (err) {
    console.error('Failed to fetch supplier returns:', err)
    return NextResponse.json(
      { error: 'Failed to fetch supplier returns' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/returns/suppliers
 * Process a supplier return (return items to supplier)
 * Requires: process_returns permission
 *
 * Atomically:
 * 1. Creates return record
 * 2. Reduces item stock
 * 3. Adjusts supplier balance (CASH/CREDIT) or exchanges item (EXCHANGE)
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'process_returns')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before processing a supplier return.'
    )
    if (branchError) return branchError

    const body = await req.json()

    // Validate
    if (
      !body.purchaseId ||
      !body.itemId ||
      body.quantity === undefined ||
      body.quantity === null ||
      !body.type ||
      body.amount === undefined ||
      body.amount === null
    ) {
      return NextResponse.json(
        { error: 'purchaseId, itemId, quantity, type, and amount are required' },
        { status: 400 }
      )
    }

    if (!Object.values(ReturnType).includes(body.type)) {
      return NextResponse.json(
        { error: 'Invalid return type. Must be CASH, CREDIT, or EXCHANGE' },
        { status: 400 }
      )
    }

    const quantity = parseFloat(String(body.quantity))
    const amount = parseFloat(String(body.amount))

    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json(
        { error: 'Quantity must be positive and amount must be non-negative' },
        { status: 400 }
      )
    }

    // Verify purchase belongs to tenant
    const purchase = await prisma.purchase.findFirst({
      where: {
        id: body.purchaseId,
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && branchId
          ? {
              OR: [{ branchId }, { branchId: null }],
            }
          : {}),
      },
      include: {
        items: true,
        supplier: true,
      },
    })

    if (!purchase) {
      return NextResponse.json(
        { error: 'Purchase not found or does not belong to your tenant' },
        { status: 404 }
      )
    }

    // Verify item was in the purchase
    const purchaseItem = purchase.items.find(pi => pi.itemId === body.itemId)
    if (!purchaseItem) {
      return NextResponse.json(
        { error: 'Item was not part of this purchase' },
        { status: 400 }
      )
    }

    const previousReturns = await prisma.supplierReturn.aggregate({
      where: {
        tenantId: context!.tenantId,
        purchaseId: body.purchaseId,
        itemId: body.itemId,
      },
      _sum: { quantity: true },
    })
    const alreadyReturned = previousReturns._sum.quantity ?? 0
    const remainingQuantity = purchaseItem.quantity - alreadyReturned

    if (quantity > remainingQuantity + 0.00001) {
      return NextResponse.json(
        { error: `Return quantity exceeds remaining returnable quantity (${remainingQuantity})` },
        { status: 400 }
      )
    }

    // Fetch item type + current stock
    const purchaseBranchId = purchase.branchId ?? branchId
    const item = await prisma.item.findFirst({
      where: {
        id: body.itemId,
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && purchaseBranchId
          ? { branchId: purchaseBranchId }
          : {}),
      },
      select: { quantity: true, itemType: true },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const isInventoryItem = item.itemType === 'INVENTORY'

    // Stock check only applies to INVENTORY items
    if (isInventoryItem && item.quantity < quantity) {
      return NextResponse.json(
        { error: 'Insufficient stock to process return' },
        { status: 400 }
      )
    }

    const tenantSettings = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { enableAccounting: true },
    })
    const accountingEnabled = tenantSettings?.enableAccounting ?? false

    // Execute atomic transaction
    const returnRecord = await prisma.$transaction(async (tx) => {
      // 1. Create return record
      const newReturn = await tx.supplierReturn.create({
        data: {
          tenantId: context!.tenantId,
          purchaseId: body.purchaseId,
          itemId: body.itemId,
          quantity,
          type: body.type as ReturnType,
          amount,
          note: body.note?.trim() || null,
        },
      })

      // 2. Reduce item stock — INVENTORY items only
      if (isInventoryItem) {
        await tx.item.update({
          where: { id: body.itemId },
          data: { quantity: { decrement: quantity } },
        })
      }

      // 3. Adjust supplier balance based on return type
      if (body.type === ReturnType.CREDIT) {
        // Supplier issues credit note — reduces our AP balance
        await tx.supplier.update({
          where: { id: purchase.supplierId },
          data: { balance: { decrement: amount } },
        })
      }
      // EXCHANGE: no balance adjustment needed

      // 4. Post journal entry (if accounting enabled)
      if (accountingEnabled) {
        await postSupplierReturnJournal(tx, {
          tenantId:        context!.tenantId,
          supplierReturnId: newReturn.id,
          postedById:      context!.user.id,
          returnAmount:    amount,
          itemCostPrice:   purchaseItem.costPrice,
          quantity,
          returnType:      body.type as ReturnType,
          isInventoryItem,
        })
      }

      return newReturn
    })

    return NextResponse.json(returnRecord, { status: 201 })
  } catch (err) {
    console.error('Failed to process supplier return:', err)
    return NextResponse.json(
      { error: 'Failed to process supplier return' },
      { status: 500 }
    )
  }
}
