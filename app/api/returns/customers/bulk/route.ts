import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ReturnType } from '@prisma/client'
import { requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import { postCustomerReturnJournal } from '@/lib/accounting/journalEngine'
import { approvedSaleWhere } from '@/lib/approvals/sales'
import { round2 } from '@/lib/accounting/accounts'
import {
  calculateReturnLine,
  maxReturnAmountFor,
  type SaleItemForReturn,
} from '@/lib/returns/customerReturn'

/**
 * POST /api/returns/customers/bulk
 *
 * Return several lines of one sale in a single operation.
 *
 * The per-item route means a 26-line sale takes 26 separate returns, each a
 * chance to mistype a quantity or to stop halfway and leave the sale partly
 * returned with nobody the wiser. It also fragments one business event into 26
 * journal entries.
 *
 * This route validates the whole return before writing anything, so a cash
 * refund is checked against what the customer *actually paid across the entire
 * sale* — including earlier returns. The per-item route can only see one line
 * at a time, which is precisely the blind spot that lets repeated partial
 * refunds exceed the amount received.
 *
 * Body: {
 *   saleId: string
 *   type: 'CASH' | 'CREDIT' | 'EXCHANGE'
 *   note?: string
 *   lines: Array<{ itemId: string, quantity: number, amount?: number }>
 * }
 *
 * Requires: process_returns
 */

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'process_returns')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before processing a return.'
    )
    if (branchError) return branchError

    const body = await req.json()
    const saleId = String(body.saleId ?? '').trim()
    const type = body.type as ReturnType
    const rawLines: unknown[] = Array.isArray(body.lines) ? body.lines : []

    if (!saleId || !type) {
      return NextResponse.json({ error: 'saleId and type are required' }, { status: 400 })
    }
    if (!Object.values(ReturnType).includes(type)) {
      return NextResponse.json({ error: 'Invalid return type' }, { status: 400 })
    }
    if (rawLines.length === 0) {
      return NextResponse.json({ error: 'Select at least one line to return' }, { status: 400 })
    }

    const sale = await prisma.sale.findFirst({
      where: approvedSaleWhere({
        id: saleId,
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && branchId ? { branchId } : {}),
      }),
      include: {
        items: {
          include: {
            taxLines: { include: { taxRate: { select: { taxPayableAccountId: true } } } },
          },
        },
      },
    })
    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    // Everything already returned against this sale, per line and in total.
    const priorReturns = await prisma.customerReturn.findMany({
      where: { tenantId: context!.tenantId, saleId },
      select: { itemId: true, quantity: true, amount: true, type: true },
    })
    const returnedQtyByItem = new Map<string, number>()
    for (const r of priorReturns) {
      returnedQtyByItem.set(r.itemId, (returnedQtyByItem.get(r.itemId) ?? 0) + r.quantity)
    }
    // Only refunds that took money out count against what was paid; a credit
    // note reduces a debt rather than emptying the drawer.
    const priorCashRefunded = round2(
      priorReturns
        .filter((r) => r.type === ReturnType.CASH)
        .reduce((sum, r) => sum + r.amount, 0)
    )

    // Names for operator-facing errors — an item id in a message is useless
    // to a cashier standing at the counter.
    const nameById = new Map(
      (
        await prisma.item.findMany({
          where: { tenantId: context!.tenantId, id: { in: sale.items.map((si) => si.itemId) } },
          select: { id: true, name: true },
        })
      ).map((i) => [i.id, i.name])
    )

    // ── Validate every line before writing any of them ──────────────────────
    const lines: { itemId: string; quantity: number; amount: number | null }[] = []
    for (const raw of rawLines) {
      const line = raw as { itemId?: unknown; quantity?: unknown; amount?: unknown }
      const itemId = String(line.itemId ?? '').trim()
      const quantity = Number(line.quantity)
      const amount =
        line.amount === undefined || line.amount === null || line.amount === ''
          ? null
          : Number(line.amount)

      if (!itemId) {
        return NextResponse.json({ error: 'Every line needs an item' }, { status: 400 })
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: 'Return quantity must be greater than zero' },
          { status: 400 }
        )
      }
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
        return NextResponse.json({ error: 'Return amount cannot be negative' }, { status: 400 })
      }
      if (lines.some((l) => l.itemId === itemId)) {
        return NextResponse.json(
          { error: 'The same item appears twice — combine it into one line' },
          { status: 400 }
        )
      }
      lines.push({ itemId, quantity, amount })
    }

    const finalLines = lines.map((line) => {
      const saleItem = sale.items.find((si) => si.itemId === line.itemId)
      if (!saleItem) {
        throw new ReturnValidationError(`An item on this return was not part of the sale`, 400)
      }
      const alreadyReturned = returnedQtyByItem.get(line.itemId) ?? 0
      const remaining = round2(saleItem.quantity - alreadyReturned)
      if (line.quantity > remaining + 0.00001) {
        throw new ReturnValidationError(
          `Only ${remaining} of "${nameById.get(line.itemId) ?? 'this item'}" remain returnable on this sale`,
          400
        )
      }
      const maxAmount = maxReturnAmountFor(saleItem as SaleItemForReturn, line.quantity)
      if (line.amount !== null && line.amount > maxAmount + 0.01) {
        throw new ReturnValidationError(
          `The refund for "${nameById.get(line.itemId) ?? 'an item'}" (${line.amount.toFixed(2)}) exceeds its refundable value of ${maxAmount.toFixed(2)}`,
          400
        )
      }
      const calc = calculateReturnLine(
        saleItem as SaleItemForReturn,
        line.quantity,
        type,
        line.amount
      )
      return { saleItem: saleItem as SaleItemForReturn, ...line, ...calc }
    })

    const returnTotal = round2(finalLines.reduce((sum, l) => sum + l.amount, 0))

    // The check the per-item route cannot make: the whole refund, plus every
    // cash refund already given on this sale, against what was actually paid.
    if (type === ReturnType.CASH) {
      const available = round2(sale.paidAmount - priorCashRefunded)
      if (returnTotal > available + 0.01) {
        return NextResponse.json(
          {
            error:
              priorCashRefunded > 0
                ? `Only ${available.toFixed(2)} of the ${sale.paidAmount.toFixed(2)} paid remains refundable — ${priorCashRefunded.toFixed(2)} has already been refunded on this sale. Use a Credit return for the balance.`
                : `Only ${sale.paidAmount.toFixed(2)} was paid on this sale, so a cash refund of ${returnTotal.toFixed(2)} is not possible. Use a Credit return to reduce the customer's balance instead.`,
          },
          { status: 400 }
        )
      }
    }

    const [tenantSettings, itemRecords] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: context!.tenantId },
        select: { enableAccounting: true },
      }),
      prisma.item.findMany({
        where: { id: { in: lines.map((l) => l.itemId) }, tenantId: context!.tenantId },
        select: { id: true, name: true, costPrice: true, itemType: true },
      }),
    ])
    const accountingEnabled = tenantSettings?.enableAccounting ?? false
    const itemById = new Map(itemRecords.map((i) => [i.id, i]))

    const created = await prisma.$transaction(async (tx) => {
      const ids: string[] = []

      for (const line of finalLines) {
        const newReturn = await tx.customerReturn.create({
          data: {
            tenantId: context!.tenantId,
            saleId,
            itemId: line.itemId,
            quantity: line.quantity,
            type,
            subtotalAmount: line.subtotalAmount,
            taxAmount: line.taxAmount,
            amount: line.amount,
            note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
          },
        })
        ids.push(newReturn.id)

        if (line.taxLines.length > 0) {
          await tx.transactionTaxLine.createMany({
            data: line.taxLines.map((taxLine) => ({
              tenantId: context!.tenantId,
              transactionType: 'CUSTOMER_RETURN' as const,
              transactionId: newReturn.id,
              transactionLineId: newReturn.id,
              customerReturnId: newReturn.id,
              saleId,
              saleItemId: line.saleItem.id,
              taxRateId: taxLine.taxRateId,
              taxName: taxLine.taxName,
              taxRatePercentage: taxLine.taxRatePercentage,
              taxableAmount: -Math.abs(taxLine.taxableAmount),
              taxAmount: -Math.abs(taxLine.taxAmount),
              calculationType: taxLine.calculationType,
            })),
          })
        }

        const itemRecord = itemById.get(line.itemId)
        const isInventoryItem = (itemRecord?.itemType ?? 'INVENTORY') === 'INVENTORY'
        if (isInventoryItem) {
          await tx.item.update({
            where: { id: line.itemId },
            data: { quantity: { increment: line.quantity } },
          })
        }

        if (accountingEnabled) {
          await postCustomerReturnJournal(tx, {
            tenantId: context!.tenantId,
            customerReturnId: newReturn.id,
            postedById: context!.user.id,
            subtotalAmount: line.subtotalAmount,
            returnAmount: line.amount,
            taxLines: line.taxLines,
            itemCostPrice: itemRecord?.costPrice ?? 0,
            quantity: line.quantity,
            returnType: type,
            isInventoryItem,
          })
        }
      }

      // One balance adjustment for the whole return rather than one per line.
      if (type === ReturnType.CREDIT && sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balance: { decrement: returnTotal } },
        })
      }

      return ids
    })

    return NextResponse.json(
      {
        returnIds: created,
        linesReturned: finalLines.length,
        totalAmount: returnTotal,
        type,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof ReturnValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Failed to process bulk customer return:', err)
    return NextResponse.json({ error: 'Failed to process return' }, { status: 500 })
  }
}

class ReturnValidationError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}
