import { NextResponse } from 'next/server'
import { ItemType, PaymentType } from '@prisma/client'
import { requireOwner, requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import {
  applyBranchScope,
  requireBranchAccess,
  requireOperationalBranch,
} from '@/lib/branch/server'

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

    const { authorized, error: permError } = requirePermission(context!, 'view_basic_reports')
    if (!authorized) return permError!

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

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before editing a purchase.'
    )
    if (branchError) return branchError

    const { id } = await params
    const body = await req.json()
    // paymentType is intentionally not read from the body — it is derived from
    // the amounts below so the flag can never contradict them.
    const { supplierId, paidAmount, items } = body

    if (!supplierId) {
      return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    // The create path validates every line via validatePurchaseRequest; this
    // handler previously validated nothing, so negative quantities produced
    // negative totals and *decremented* stock.
    for (const line of items as { itemId?: string; quantity?: unknown; costPrice?: unknown }[]) {
      if (!line.itemId || typeof line.itemId !== 'string') {
        return NextResponse.json({ error: 'Each line must reference an item' }, { status: 400 })
      }
      const qty = Number(line.quantity)
      const cost = Number(line.costPrice)
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json({ error: 'Each line must have a quantity greater than zero' }, { status: 400 })
      }
      if (!Number.isFinite(cost) || cost < 0) {
        return NextResponse.json({ error: 'Each line must have a valid cost price' }, { status: 400 })
      }
    }

    const totalAmount = Number(
      items
        .reduce((sum: number, i: { quantity: number; costPrice: number }) => sum + Number(i.quantity) * Number(i.costPrice), 0)
        .toFixed(2)
    )

    // Was Math.min(...), which silently truncated an over-payment down to the
    // new total and had no negative floor — a negative paidAmount inflated the
    // supplier balance beyond the purchase value.
    const requestedPaid = Number(paidAmount)
    if (!Number.isFinite(requestedPaid) || requestedPaid < 0) {
      return NextResponse.json({ error: 'Amount paid must be a positive number' }, { status: 400 })
    }
    if (requestedPaid > totalAmount + 0.001) {
      return NextResponse.json(
        {
          error: `Amount paid (${requestedPaid.toFixed(2)}) exceeds the new total (${totalAmount.toFixed(2)}). Reduce the amount paid, or record a supplier return for the difference.`,
        },
        { status: 400 }
      )
    }
    const paid = requestedPaid

    // Fetch current purchase
    const purchase = await prisma.purchase.findFirst({
      where: {
        id,
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && branchId
          ? {
              OR: [{ branchId }, { branchId: null }],
            }
          : {}),
      },
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

    // Returns are computed against the original purchase lines — editing them
    // afterwards leaves the return referencing quantities that no longer exist.
    const existingReturn = await prisma.supplierReturn.findFirst({
      where: { purchaseId: id },
      select: { id: true },
    })
    if (existingReturn) {
      return NextResponse.json(
        { error: 'This purchase has returns processed against it and can no longer be edited. Record a further return to correct it.' },
        { status: 409 }
      )
    }

    // Supplier payments decrement the supplier balance globally with no link
    // back to a specific purchase. Reversing this purchase's original credit
    // would therefore subtract money the supplier has already been paid,
    // driving the payable negative. Refuse rather than corrupt the ledger.
    const paymentSincePurchase = await prisma.supplierPayment.findFirst({
      where: { supplierId: purchase.supplierId, createdAt: { gte: purchase.createdAt } },
      select: { id: true },
    })
    if (paymentSincePurchase) {
      return NextResponse.json(
        {
          error: 'Payments have been recorded against this supplier since this purchase. Editing it would corrupt the supplier balance — record a supplier return or a balance adjustment instead.',
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

    const purchaseBranchId = purchase.branchId ?? branchId
    // Deduplicated — a legitimate body with the same item on two lines
    // previously produced a misleading "items not found" 404.
    const itemIds = Array.from(new Set(items.map((item: { itemId: string }) => item.itemId)))
    const dbItems = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && purchaseBranchId
          ? { branchId: purchaseBranchId }
          : {}),
      },
      // itemType is needed so non-inventory lines are not given phantom stock
      select: { id: true, name: true, itemType: true },
    })

    if (dbItems.length !== itemIds.length) {
      return NextResponse.json({ error: 'One or more items were not found in this branch' }, { status: 404 })
    }

    const itemMap = new Map(dbItems.map((i) => [i.id, i]))

    const oldCreditAmount = purchase.totalAmount - purchase.paidAmount
    const newCreditAmount = totalAmount - paid

    await prisma.$transaction(async (tx) => {
      // 1. Reverse old stock additions. Guarded — this is a subtraction, and
      // some or all of the received stock may already have been sold, so an
      // unguarded decrement drove item quantity negative.
      for (const pi of purchase.items) {
        const stockItem = itemMap.get(pi.itemId)
        // Only INVENTORY items ever received stock on the create path
        if (stockItem && stockItem.itemType !== ItemType.INVENTORY) continue
        const reversed = await tx.item.updateMany({
          where: {
            id: pi.itemId,
            tenantId: context!.tenantId,
            itemType: ItemType.INVENTORY,
            quantity: { gte: pi.quantity },
          },
          data: { quantity: { decrement: pi.quantity } },
        })
        if (reversed.count !== 1) {
          const label = stockItem?.name ?? 'item'
          throw new Error(
            `Cannot edit this purchase: "${label}" no longer has the ${pi.quantity} units that were received, so the original stock cannot be reversed. Record a supplier return instead.`
          )
        }
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
          quantity: Number(i.quantity),
          costPrice: Number(i.costPrice),
        })),
      })

      // 4. Add new stock, and record the corrected cost price — the create
      // path updates item.costPrice but this handler previously did not, so a
      // cost correction made by editing never reached the item or COGS.
      for (const i of items as { itemId: string; quantity: number; costPrice: number }[]) {
        if (itemMap.get(i.itemId)?.itemType !== ItemType.INVENTORY) continue
        await tx.item.update({
          where: { id: i.itemId },
          data: {
            quantity: { increment: Number(i.quantity) },
            costPrice: Number(i.costPrice),
          },
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
          ...(context!.branchesEnabled && branchId && !purchase.branchId
            ? { branchId }
            : {}),
          supplierId,
          // Derived, matching the create path. Taking it raw from the body let
          // a caller save a record flagged CASH that still carried a payable,
          // so the list and detail pages disagreed about the same purchase.
          paymentType: newCreditAmount > 0 ? PaymentType.CREDIT : PaymentType.CASH,
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

    // void_purchases was defined, granted to roles and shown as a toggle in the
    // admin permission editor, but no handler ever checked it — the toggle was
    // inert and only the hardcoded OWNER role mattered.
    const { authorized, error: permError } = requirePermission(context!, 'void_purchases')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before voiding a purchase.'
    )
    if (branchError) return branchError

    const { id } = await params

    // Fetch purchase with all details
    const purchase = await prisma.purchase.findFirst({
      where: {
        id,
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

    // Same reasoning as the edit path: supplier payments are not linked to a
    // purchase, so reversing this purchase's credit after a payment would
    // subtract money already paid and drive the payable negative.
    const paymentSincePurchase = await prisma.supplierPayment.findFirst({
      where: { supplierId: purchase.supplierId, createdAt: { gte: purchase.createdAt } },
      select: { id: true },
    })
    if (paymentSincePurchase) {
      return NextResponse.json(
        {
          error: 'Payments have been recorded against this supplier since this purchase. Voiding it would corrupt the supplier balance — record a supplier return instead.',
        },
        { status: 409 }
      )
    }

    const creditAmount = purchase.totalAmount - purchase.paidAmount
    const purchaseBranchId = purchase.branchId ?? branchId

    // Check if there's enough stock to reverse
    for (const purchaseItem of purchase.items) {
      const item = await prisma.item.findFirst({
        where: {
          id: purchaseItem.itemId,
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled && purchaseBranchId
            ? { branchId: purchaseBranchId }
            : {}),
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
