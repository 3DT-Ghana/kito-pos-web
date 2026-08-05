import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ReturnType } from '@prisma/client'
import {
  requireBranchAccess,
  requireOperationalBranch,
} from '@/lib/branch/server'
import { postCustomerReturnJournal } from '@/lib/accounting/journalEngine'
import { approvedSaleWhere } from '@/lib/approvals/sales'
import { round2 } from '@/lib/accounting/accounts'
import { scaleTaxLines } from '@/lib/tax/engine'

/**
 * Customer Returns API
 *
 * GET /api/returns/customers - List all customer returns
 * POST /api/returns/customers - Process customer return
 */

/**
 * GET /api/returns/customers
 * List all customer returns
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Was unprotected — any authenticated user could read the full refund
    // history including customer names and amounts.
    const { authorized, error: permError } = requirePermission(context!, 'process_returns')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const saleId = searchParams.get('saleId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: context!.tenantId }

    if (saleId) {
      where.saleId = saleId
    }

    if (context!.branchesEnabled && !context!.allBranchesSelected) {
      where.sale = { branchId: context!.currentBranchId }
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
    }

    const returns = await prisma.customerReturn.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        item: { select: { id: true, name: true } },
        sale: {
          select: {
            id: true,
            customer: { select: { id: true, name: true } },
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
    console.error('Failed to fetch customer returns:', err)
    return NextResponse.json(
      { error: 'Failed to fetch customer returns' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/returns/customers
 * Process a customer return
 * Requires: process_returns permission
 *
 * Atomically:
 * 1. Creates return record
 * 2. Restores item stock
 * 3. Adjusts customer balance (CASH/CREDIT) or exchanges item (EXCHANGE)
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'process_returns')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before processing a customer return.'
    )
    if (branchError) return branchError

    const body = await req.json()

    // Validate
    if (
      !body.saleId ||
      !body.itemId ||
      body.quantity === undefined ||
      body.quantity === null ||
      !body.type
    ) {
      return NextResponse.json(
        { error: 'saleId, itemId, quantity, and type are required' },
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
    const amount = body.amount === undefined || body.amount === null
      ? null
      : parseFloat(String(body.amount))

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      (amount !== null && (!Number.isFinite(amount) || amount < 0))
    ) {
      return NextResponse.json(
        { error: 'Quantity must be positive and amount must be non-negative when provided' },
        { status: 400 }
      )
    }

    // Verify sale belongs to tenant
    const sale = await prisma.sale.findFirst({
      where: approvedSaleWhere({
        id: body.saleId,
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && branchId ? { branchId } : {}),
      }),
      include: {
        items: {
          include: {
            taxLines: {
              include: {
                taxRate: {
                  select: {
                    id: true,
                    taxPayableAccountId: true,
                  },
                },
              },
            },
          },
        },
        customer: true,
      },
    })

    if (!sale) {
      return NextResponse.json(
        { error: 'Sale not found or does not belong to your tenant' },
        { status: 404 }
      )
    }

    // Verify item was in the sale
    const saleItem = sale.items.find(si => si.itemId === body.itemId)
    if (!saleItem) {
      return NextResponse.json(
        { error: 'Item was not part of this sale' },
        { status: 400 }
      )
    }

    const previousReturns = await prisma.customerReturn.aggregate({
      where: {
        tenantId: context!.tenantId,
        saleId: body.saleId,
        itemId: body.itemId,
      },
      _sum: { quantity: true },
    })
    const alreadyReturned = previousReturns._sum.quantity ?? 0
    const remainingQuantity = saleItem.quantity - alreadyReturned

    if (quantity > remainingQuantity + 0.00001) {
      return NextResponse.json(
        { error: `Return quantity exceeds remaining returnable quantity (${remainingQuantity})` },
        { status: 400 }
      )
    }

    const quantityRatio = saleItem.quantity > 0 ? quantity / saleItem.quantity : 0
    const maxReturnAmount = round2(
      (saleItem.lineTotalAmount || Math.max(0, saleItem.price * saleItem.quantity - (saleItem.discountAmount ?? 0))) *
        quantityRatio
    )

    if (amount !== null && amount > maxReturnAmount + 0.01) {
      return NextResponse.json(
        { error: `Return amount exceeds the refundable value for this quantity (${maxReturnAmount.toFixed(2)})` },
        { status: 400 }
      )
    }

    // A CASH refund pays real money out of the drawer. On a credit sale that was
    // never settled there is nothing to refund — the correct action is a CREDIT
    // return, which reduces what the customer owes.
    if (body.type === ReturnType.CASH) {
      const refundCap = amount ?? maxReturnAmount
      // Cash already refunded on this sale counts against what was paid.
      // Checking this refund alone let repeated partial refunds total more than
      // the customer ever handed over — the quantity check above has always
      // summed prior returns, and this now matches it.
      const priorCashRefunds = await prisma.customerReturn.aggregate({
        where: { tenantId: context!.tenantId, saleId: body.saleId, type: ReturnType.CASH },
        _sum: { amount: true },
      })
      const alreadyRefunded = round2(priorCashRefunds._sum.amount ?? 0)
      const available = round2(sale.paidAmount - alreadyRefunded)

      if (refundCap > available + 0.01) {
        return NextResponse.json(
          {
            error:
              alreadyRefunded > 0
                ? `Only ${available.toFixed(2)} of the ${sale.paidAmount.toFixed(2)} paid remains refundable — ${alreadyRefunded.toFixed(2)} has already been refunded on this sale. Use a Credit return for the balance.`
                : `Only ${sale.paidAmount.toFixed(2)} was actually paid on this sale, so a cash refund of ${refundCap.toFixed(2)} is not possible. Use a Credit return to reduce the customer's balance instead.`,
          },
          { status: 400 }
        )
      }
    }

    const extraScale = amount !== null && maxReturnAmount > 0
      ? amount / maxReturnAmount
      : 1
    const effectiveScale = quantityRatio * extraScale

    let subtotalAmount = round2(
      (saleItem.lineSubtotalAmount || Math.max(0, saleItem.price * saleItem.quantity - (saleItem.discountAmount ?? 0))) *
        effectiveScale
    )

    const returnTaxLines = scaleTaxLines(
      saleItem.taxLines.map((taxLine) => ({
        taxRateId: taxLine.taxRateId,
        taxName: taxLine.taxName,
        taxRatePercentage: taxLine.taxRatePercentage,
        taxableAmount: taxLine.taxableAmount,
        taxAmount: taxLine.taxAmount,
        calculationType: taxLine.calculationType,
      })),
      effectiveScale
    ).map((taxLine) => ({
      ...taxLine,
      taxPayableAccountId: saleItem.taxLines.find(
        (existingTaxLine) => existingTaxLine.taxRateId === taxLine.taxRateId
      )?.taxRate?.taxPayableAccountId ?? null,
    }))

    const postedTaxLines =
      body.type === ReturnType.EXCHANGE ? [] : returnTaxLines

    if (amount !== null) {
      const diff = round2(
        amount -
          (subtotalAmount +
            round2(postedTaxLines.reduce((sum, taxLine) => sum + taxLine.taxAmount, 0)))
      )
      subtotalAmount = round2(Math.max(0, subtotalAmount + diff))
    }

    const resolvedTaxAmount = round2(
      postedTaxLines.reduce((sum, taxLine) => sum + taxLine.taxAmount, 0)
    )
    const resolvedAmount = round2(subtotalAmount + resolvedTaxAmount)

    const tenantSettings = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { enableAccounting: true },
    })
    const accountingEnabled = tenantSettings?.enableAccounting ?? false

    // Fetch item type and cost for stock + COGS reversal decisions
    const returnItem = await prisma.item.findFirst({
      where: { id: body.itemId, tenantId: context!.tenantId },
      select: { costPrice: true, itemType: true },
    })
    const itemCostPrice = returnItem?.costPrice ?? 0
    const isInventoryItem = (returnItem?.itemType ?? 'INVENTORY') === 'INVENTORY'

    // Execute atomic transaction
    const returnRecord = await prisma.$transaction(async (tx) => {
      // 1. Create return record
      const newReturn = await tx.customerReturn.create({
        data: {
          tenantId: context!.tenantId,
          saleId: body.saleId,
          itemId: body.itemId,
          quantity,
          type: body.type as ReturnType,
          subtotalAmount,
          taxAmount: resolvedTaxAmount,
          amount: resolvedAmount,
          note: body.note?.trim() || null,
        },
      })

      if (postedTaxLines.length > 0) {
        await tx.transactionTaxLine.createMany({
          data: postedTaxLines.map((taxLine) => ({
            tenantId: context!.tenantId,
            transactionType: 'CUSTOMER_RETURN' as const,
            transactionId: newReturn.id,
            transactionLineId: newReturn.id,
            customerReturnId: newReturn.id,
            saleId: sale.id,
            saleItemId: saleItem.id,
            taxRateId: taxLine.taxRateId,
            taxName: taxLine.taxName,
            taxRatePercentage: taxLine.taxRatePercentage,
            taxableAmount: -Math.abs(taxLine.taxableAmount),
            taxAmount: -Math.abs(taxLine.taxAmount),
            calculationType: taxLine.calculationType,
          })),
        })
      }

      // 2. Restore item stock — INVENTORY items only
      if (isInventoryItem) {
        await tx.item.update({
          where: { id: body.itemId },
          data: { quantity: { increment: quantity } },
        })
      }

      // 3. Adjust customer balance based on return type
      if (body.type === ReturnType.CREDIT && sale.customerId) {
        // Credit note reduces what customer owes
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balance: { decrement: resolvedAmount } },
        })
      }
      // EXCHANGE: no balance adjustment needed

      // 4. Post journal entry (if accounting enabled)
      if (accountingEnabled) {
        await postCustomerReturnJournal(tx, {
          tenantId:        context!.tenantId,
          customerReturnId: newReturn.id,
          postedById:      context!.user.id,
          subtotalAmount,
          returnAmount:    resolvedAmount,
          taxLines:        postedTaxLines,
          itemCostPrice,
          quantity,
          returnType:      body.type as ReturnType,
          isInventoryItem,
        })
      }

      return newReturn
    })

    return NextResponse.json(returnRecord, { status: 201 })
  } catch (err) {
    console.error('Failed to process customer return:', err)
    return NextResponse.json(
      { error: 'Failed to process customer return' },
      { status: 500 }
    )
  }
}
