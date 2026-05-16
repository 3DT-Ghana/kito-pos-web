import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { ItemType, TaxCalculationType } from '@prisma/client'
import { requireOwner } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'
import {
  calculateLineTaxes,
  resolveItemTaxProfile,
} from '@/lib/tax/engine'
import {
  getTenantTaxConfiguration,
  itemTaxSettingInclude,
} from '@/lib/tax/server'

/**
 * Sale Detail API Routes
 *
 * GET /api/sales/[id]    - Get sale by ID
 * PUT /api/sales/[id]    - Edit sale (full replace, adjusts stock + balance)
 * DELETE /api/sales/[id] - Void sale (delete with rollback)
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/sales/[id]
 * Get a specific sale with all details
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { id } = await params

    const sale = await prisma.sale.findFirst({
      where: applyBranchScope({ id, tenantId: context!.tenantId }, context!),
      include: {
        customer: true,
        taxLines: true,
        items: {
          include: {
            taxLines: true,
            item: {
              include: {
                manufacturer: true,
              },
            },
          },
        },
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    return NextResponse.json(sale)
  } catch (err) {
    console.error('Failed to fetch sale:', err)
    return NextResponse.json(
      { error: 'Failed to fetch sale' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/sales/[id]
 * Edit a sale — replace items, customer, payment type and amounts.
 * Requires: OWNER role
 *
 * Body: { customerId?, paymentType, paidAmount, items: [{ itemId, quantity, price }] }
 *
 * Atomically:
 * 1. Restore old stock and reverse old customer balance
 * 2. Validate new stock availability
 * 3. Delete old items, create new items
 * 4. Deduct new stock, apply new customer balance
 * 5. Update sale record
 */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: roleError } = requireOwner(context!.user.role)
    if (!authorized) return roleError!

    const { id } = await params
    const body = await req.json()
    const { customerId, paymentType, paidAmount, items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    // Fetch current sale
    const sale = await prisma.sale.findFirst({
      where: applyBranchScope({ id, tenantId: context!.tenantId }, context!),
      include: {
        items: {
          include: {
            item: {
              select: {
                itemType: true,
              },
            },
          },
        },
      },
    })
    if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

    const saleJournal = await prisma.journalEntry.findFirst({
      where: { tenantId: context!.tenantId, saleId: id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { entryNumber: true, status: true },
    })
    if (saleJournal) {
      return NextResponse.json(
        {
          error: `This sale already has accounting history (${saleJournal.entryNumber}, ${saleJournal.status}). Posted sales must be corrected with reversing entries and replacement transactions instead of editing the source document.`,
        },
        { status: 409 }
      )
    }

    if (customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId: context!.tenantId },
        select: { id: true },
      })
      if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
    }

    const oldCreditAmount = sale.totalAmount - sale.paidAmount
    const itemIds = Array.from(
      new Set(
        items
          .map((item: { itemId?: string }) => item.itemId)
          .filter((itemId): itemId is string => Boolean(itemId))
      )
    )

    const itemRecords = await prisma.item.findMany({
      where: {
        tenantId: context!.tenantId,
        id: { in: itemIds },
        ...(context!.branchesEnabled ? { branchId: sale.branchId ?? null } : {}),
      },
      include: itemTaxSettingInclude,
    })
    const itemMap = new Map(itemRecords.map((item) => [item.id, item]))

    for (const requestedItemId of itemIds) {
      if (!itemMap.has(requestedItemId)) {
        return NextResponse.json(
          { error: `Item not found: ${requestedItemId}` },
          { status: 404 }
        )
      }
    }

    const { taxSetting, activeRates, defaultRates } = await getTenantTaxConfiguration(
      prisma,
      context!.tenantId,
      sale.createdAt
    )

    let subtotalAmount = 0
    let totalTaxAmount = 0
    let totalAmount = 0
    const computedItems = items.map(
      (line: {
        itemId: string
        quantity: number
        price: number
        discountAmount?: number
        isTaxable?: boolean
        taxRateIds?: string[]
        taxCalculationType?: TaxCalculationType
      }) => {
        const itemRecord = itemMap.get(line.itemId)
        if (!itemRecord) {
          throw new Error(`Item not found: ${line.itemId}`)
        }

        if (
          line.taxCalculationType !== undefined &&
          !Object.values(TaxCalculationType).includes(line.taxCalculationType)
        ) {
          throw new Error('Invalid tax calculation type')
        }

        const quantity = Number(line.quantity)
        const price = Number(line.price)
        const discountAmount = Number(line.discountAmount ?? 0)
        const taxProfile = resolveItemTaxProfile({
          tenantTaxSetting: taxSetting,
          activeRates,
          defaultRates,
          item: itemRecord,
          override: {
            isTaxable: line.isTaxable,
            taxRateIds: Array.isArray(line.taxRateIds) ? line.taxRateIds : undefined,
            taxCalculationType: line.taxCalculationType,
          },
          at: sale.createdAt,
        })
        const taxComputation = calculateLineTaxes({
          unitPrice: price,
          quantity,
          discountAmount,
          profile: taxProfile,
        })

        subtotalAmount += taxComputation.taxableAmount
        totalTaxAmount += taxComputation.taxAmount
        totalAmount += taxComputation.totalAmount

        return {
          id: randomUUID(),
          itemId: line.itemId,
          quantity,
          price,
          discountAmount,
          itemType: itemRecord.itemType,
          taxComputation,
          data: {
            id: randomUUID(),
            itemId: line.itemId,
            quantity,
            price,
            discountAmount,
            isTaxable: taxComputation.isTaxable,
            taxCalculationType: taxComputation.calculationType,
            lineSubtotalAmount: taxComputation.taxableAmount,
            lineTaxAmount: taxComputation.taxAmount,
            lineTotalAmount: taxComputation.totalAmount,
          },
        }
      }
    )

    subtotalAmount = Number(subtotalAmount.toFixed(2))
    totalTaxAmount = Number(totalTaxAmount.toFixed(2))
    totalAmount = Number(totalAmount.toFixed(2))
    const paid = Math.min(parseFloat(String(paidAmount)) || 0, totalAmount)

    // Validate new stock (items that aren't already in old sale get their existing qty checked)
    for (const newItem of items) {
      const oldSaleItem = sale.items.find((si) => si.itemId === newItem.itemId)
      const oldQty = oldSaleItem?.quantity ?? 0
      const stockItem = itemMap.get(newItem.itemId)
      if (!stockItem) {
        return NextResponse.json({ error: `Item not found: ${newItem.itemId}` }, { status: 404 })
      }
      if (stockItem.itemType !== ItemType.INVENTORY) {
        continue
      }
      const requestedQuantity = Number(newItem.quantity)
      const availableAfterRestore = stockItem.quantity + oldQty
      if (availableAfterRestore < requestedQuantity) {
        return NextResponse.json(
          { error: `Insufficient stock for "${stockItem.name}". Available: ${availableAfterRestore}, requested: ${requestedQuantity}` },
          { status: 400 }
        )
      }
    }

    const newCreditAmount = totalAmount - paid

    await prisma.$transaction(async (tx) => {
      // 1. Restore old stock
      for (const si of sale.items) {
        if (si.item.itemType !== ItemType.INVENTORY) continue
        await tx.item.update({
          where: { id: si.itemId },
          data: { quantity: { increment: si.quantity } },
        })
      }

      // 2. Reverse old customer balance
      if (oldCreditAmount > 0 && sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balance: { decrement: oldCreditAmount } },
        })
      }

      // 3. Replace sale items
      await tx.saleItem.deleteMany({ where: { saleId: id } })
      await tx.saleItem.createMany({
        data: computedItems.map((item) => ({
          saleId: id,
          ...item.data,
        })),
      })

      // 4. Deduct new stock
      for (const item of computedItems) {
        if (item.itemType !== ItemType.INVENTORY) continue
        await tx.item.update({
          where: { id: item.itemId },
          data: { quantity: { decrement: item.quantity } },
        })
      }

      const transactionTaxLines = computedItems.flatMap((item) =>
        item.taxComputation.taxLines.map((taxLine) => ({
          tenantId: context!.tenantId,
          transactionType: 'SALE' as const,
          transactionId: id,
          transactionLineId: item.data.id,
          saleId: id,
          saleItemId: item.data.id,
          taxRateId: taxLine.taxRateId,
          taxName: taxLine.taxName,
          taxRatePercentage: taxLine.taxRatePercentage,
          taxableAmount: taxLine.taxableAmount,
          taxAmount: taxLine.taxAmount,
          calculationType: taxLine.calculationType,
        }))
      )

      if (transactionTaxLines.length > 0) {
        await tx.transactionTaxLine.createMany({
          data: transactionTaxLines,
        })
      }

      // 5. Apply new customer balance
      if (newCreditAmount > 0 && customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { increment: newCreditAmount } },
        })
      }

      // 6. Update sale record
      await tx.sale.update({
        where: { id },
        data: {
          customerId: customerId || null,
          paymentType: newCreditAmount > 0 ? 'CREDIT' : (paymentType || 'CASH'),
          subtotalAmount,
          taxAmount: totalTaxAmount,
          totalAmount,
          paidAmount: paid,
        },
      })
    })

    const updated = await prisma.sale.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: {
        customer: true,
        taxLines: true,
        items: {
          include: {
            taxLines: true,
            item: { include: { manufacturer: true } },
          },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update sale:', err)
    return NextResponse.json({ error: 'Failed to update sale' }, { status: 500 })
  }
}

/**
 * DELETE /api/sales/[id]
 * Void a sale (delete with rollback)
 * Requires: OWNER role (void_sales permission)
 *
 * Atomically:
 * 1. Deletes sale items
 * 2. Restores item stock
 * 3. Reverses customer balance (if credit sale)
 * 4. Deletes sale record
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Only OWNERs can void sales
    const { authorized, error: roleError } = requireOwner(context!.user.role)
    if (!authorized) return roleError!

    const { id } = await params

    // Fetch sale with all details
    const sale = await prisma.sale.findFirst({
      where: applyBranchScope({ id, tenantId: context!.tenantId }, context!),
      include: {
        items: {
          include: {
            item: {
              select: {
                itemType: true,
              },
            },
          },
        },
        customer: true,
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    const saleJournal = await prisma.journalEntry.findFirst({
      where: { tenantId: context!.tenantId, saleId: id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { entryNumber: true, status: true },
    })
    if (saleJournal) {
      return NextResponse.json(
        {
          error: `This sale already has accounting history (${saleJournal.entryNumber}, ${saleJournal.status}). Posted sales must be reversed instead of deleted.`,
        },
        { status: 409 }
      )
    }

    const creditAmount = sale.totalAmount - sale.paidAmount

    // Execute atomic rollback transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete sale items
      await tx.saleItem.deleteMany({
        where: { saleId: id },
      })

      // 2. Restore item stock
      for (const saleItem of sale.items) {
        if (saleItem.item.itemType !== ItemType.INVENTORY) continue
        await tx.item.update({
          where: { id: saleItem.itemId },
          data: {
            quantity: {
              increment: saleItem.quantity,
            },
          },
        })
      }

      // 3. Reverse customer balance (if credit sale)
      if (creditAmount > 0 && sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: {
            balance: {
              decrement: creditAmount,
            },
          },
        })
      }

      // 4. Delete sale
      await tx.sale.delete({
        where: { id },
      })
    })

    return NextResponse.json(
      {
        message: 'Sale voided successfully',
        voidedAmount: sale.totalAmount,
        restoredItems: sale.items.length,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('Failed to void sale:', err)
    return NextResponse.json(
      { error: 'Failed to void sale' },
      { status: 500 }
    )
  }
}
