import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'

/**
 * Purchase Detail API Routes
 *
 * GET /api/purchases/[id]    - Get purchase by ID
 * PUT /api/purchases/[id]    - Edit purchase (full replace, adjusts stock + balance)
 * DELETE /api/purchases/[id] - Void purchase (delete with rollback)
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/purchases/[id]
 * Get a specific purchase with all details
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { id } = await params

    const purchase = await prisma.purchase.findFirst({
      where: applyBranchScope({ id, tenantId: context!.tenantId }, context!),
      include: {
        supplier: true,
        items: {
          include: {
            item: {
              include: {
                manufacturer: true,
              },
            },
          },
        },
      },
    })

    if (!purchase) {
      return NextResponse.json(
        { error: 'Purchase not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(purchase)
  } catch (err) {
    console.error('Failed to fetch purchase:', err)
    return NextResponse.json(
      { error: 'Failed to fetch purchase' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/purchases/[id]
 * Edit a purchase — replace items, supplier, payment type and amounts.
 * Requires: OWNER role
 *
 * Body: { supplierId, paymentType, paidAmount, items: [{ itemId, quantity, costPrice }] }
 *
 * Atomically:
 * 1. Reverse old stock additions and old supplier balance
 * 2. Validate new stock (can go negative only for purchases — adding stock is always valid)
 * 3. Delete old items, create new items
 * 4. Add new stock, apply new supplier balance
 * 5. Update purchase record
 */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: roleError } = requireOwner(context!.user.role)
    if (!authorized) return roleError!

    const { id } = await params
    const body = await req.json()
    const { supplierId, paymentType, paidAmount, items } = body

    if (!supplierId) {
      return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    const totalAmount = items.reduce(
      (sum: number, i: { quantity: number; costPrice: number }) => sum + i.quantity * i.costPrice,
      0
    )
    const paid = Math.min(parseFloat(String(paidAmount)) || 0, totalAmount)

    // Fetch current purchase
    const purchase = await prisma.purchase.findFirst({
      where: applyBranchScope({ id, tenantId: context!.tenantId }, context!),
      include: { items: true },
    })
    if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })

    const purchaseJournal = await prisma.journalEntry.findFirst({
      where: { tenantId: context!.tenantId, purchaseId: id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { entryNumber: true, status: true },
    })
    if (purchaseJournal) {
      return NextResponse.json(
        {
          error: `This purchase already has accounting history (${purchaseJournal.entryNumber}, ${purchaseJournal.status}). Posted purchases must be corrected with reversing entries and replacement transactions instead of editing the source document.`,
        },
        { status: 409 }
      )
    }

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, tenantId: context!.tenantId },
      select: { id: true },
    })
    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    const itemIds = items.map((item: { itemId: string }) => item.itemId)
    const dbItems = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled ? { branchId: purchase.branchId ?? null } : {}),
      },
      select: { id: true },
    })

    if (dbItems.length !== itemIds.length) {
      return NextResponse.json({ error: 'One or more items were not found in this branch' }, { status: 404 })
    }

    const oldCreditAmount = purchase.totalAmount - purchase.paidAmount
    const newCreditAmount = totalAmount - paid

    await prisma.$transaction(async (tx) => {
      // 1. Reverse old stock additions
      for (const pi of purchase.items) {
        await tx.item.update({
          where: { id: pi.itemId },
          data: { quantity: { decrement: pi.quantity } },
        })
      }

      // 2. Reverse old supplier balance
      if (oldCreditAmount > 0) {
        await tx.supplier.update({
          where: { id: purchase.supplierId },
          data: { balance: { decrement: oldCreditAmount } },
        })
      }

      // 3. Replace purchase items
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } })
      await tx.purchaseItem.createMany({
        data: items.map((i: { itemId: string; quantity: number; costPrice: number }) => ({
          purchaseId: id,
          itemId: i.itemId,
          quantity: i.quantity,
          costPrice: i.costPrice,
        })),
      })

      // 4. Add new stock
      for (const i of items) {
        await tx.item.update({
          where: { id: i.itemId },
          data: { quantity: { increment: i.quantity } },
        })
      }

      // 5. Apply new supplier balance
      if (newCreditAmount > 0) {
        await tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { increment: newCreditAmount } },
        })
      }

      // 6. Update purchase record
      await tx.purchase.update({
        where: { id },
        data: {
          supplierId,
          paymentType: paymentType || 'CASH',
          totalAmount,
          paidAmount: paid,
        },
      })
    })

    const updated = await prisma.purchase.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: {
        supplier: true,
        items: { include: { item: { include: { manufacturer: true } } } },
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update purchase:', err)
    return NextResponse.json({ error: 'Failed to update purchase' }, { status: 500 })
  }
}

/**
 * DELETE /api/purchases/[id]
 * Void a purchase (delete with rollback)
 * Requires: OWNER role (void_purchases permission)
 *
 * Atomically:
 * 1. Deletes purchase items
 * 2. Reduces item stock
 * 3. Reverses supplier balance (if credit purchase)
 * 4. Deletes purchase record
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Only OWNERs can void purchases
    const { authorized, error: roleError } = requireOwner(context!.user.role)
    if (!authorized) return roleError!

    const { id } = await params

    // Fetch purchase with all details
    const purchase = await prisma.purchase.findFirst({
      where: applyBranchScope({ id, tenantId: context!.tenantId }, context!),
      include: {
        items: true,
        supplier: true,
      },
    })

    if (!purchase) {
      return NextResponse.json(
        { error: 'Purchase not found' },
        { status: 404 }
      )
    }

    const purchaseJournal = await prisma.journalEntry.findFirst({
      where: { tenantId: context!.tenantId, purchaseId: id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { entryNumber: true, status: true },
    })
    if (purchaseJournal) {
      return NextResponse.json(
        {
          error: `This purchase already has accounting history (${purchaseJournal.entryNumber}, ${purchaseJournal.status}). Posted purchases must be reversed instead of deleted.`,
        },
        { status: 409 }
      )
    }

    const creditAmount = purchase.totalAmount - purchase.paidAmount

    // Check if there's enough stock to reverse
    for (const purchaseItem of purchase.items) {
      const item = await prisma.item.findFirst({
        where: {
          id: purchaseItem.itemId,
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled ? { branchId: purchase.branchId ?? null } : {}),
        },
      })

      if (!item) {
        return NextResponse.json(
          { error: `Item not found: ${purchaseItem.itemId}` },
          { status: 404 }
        )
      }

      if (item.quantity < purchaseItem.quantity) {
        return NextResponse.json(
          {
            error: `Cannot void purchase: Insufficient stock for item "${item.name}". Current: ${item.quantity}, Required: ${purchaseItem.quantity}`,
          },
          { status: 400 }
        )
      }
    }

    // Execute atomic rollback transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete purchase items
      await tx.purchaseItem.deleteMany({
        where: { purchaseId: id },
      })

      // 2. Reduce item stock (reverse the increase)
      for (const purchaseItem of purchase.items) {
        await tx.item.update({
          where: { id: purchaseItem.itemId },
          data: {
            quantity: {
              decrement: purchaseItem.quantity,
            },
          },
        })
      }

      // 3. Reverse supplier balance (if credit purchase)
      if (creditAmount > 0) {
        await tx.supplier.update({
          where: { id: purchase.supplierId },
          data: {
            balance: {
              decrement: creditAmount,
            },
          },
        })
      }

      // 4. Delete purchase
      await tx.purchase.delete({
        where: { id },
      })
    })

    return NextResponse.json(
      {
        message: 'Purchase voided successfully',
        voidedAmount: purchase.totalAmount,
        reversedItems: purchase.items.length,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('Failed to void purchase:', err)
    return NextResponse.json(
      { error: 'Failed to void purchase' },
      { status: 500 }
    )
  }
}
