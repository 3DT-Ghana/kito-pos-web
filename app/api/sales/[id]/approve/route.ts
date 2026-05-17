import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ApprovalStatus } from '@prisma/client'
import { requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import { postSaleJournal, SaleLineBreakdown } from '@/lib/accounting/journalEngine'
import { round2, ACCOUNT_CODES } from '@/lib/accounting/accounts'

/**
 * POST /api/sales/[id]/approve
 * Approve a pending sale — commits stock, customer balance, and journal.
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

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before approving a sale.'
    )
    if (branchError) return branchError

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const note: string | undefined = body.note

    const saleWhere = {
      id,
      tenantId: context!.tenantId,
      approvalStatus: ApprovalStatus.PENDING,
      ...(context!.branchesEnabled && branchId ? { branchId } : {}),
    }

    const sale = await prisma.sale.findFirst({
      where: saleWhere,
      include: {
        items: {
          include: {
            item: true,
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
      },
    })

    if (!sale) {
      return NextResponse.json(
        { error: 'Pending sale not found' },
        { status: 404 }
      )
    }

    const totalAmount = sale.totalAmount
    const paidAmount = sale.paidAmount
    const creditAmount = totalAmount - paidAmount

    const tenantSettings = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { enableAccounting: true },
    })
    const accountingEnabled = tenantSettings?.enableAccounting ?? false

    // Build journal lines
    let defaultSalesRevId: string | null = null
    let defaultServiceRevId: string | null = null
    let defaultCogsId: string | null = null
    let defaultInvId: string | null = null

    if (accountingEnabled) {
      const accountRows = await prisma.account.findMany({
        where: {
          tenantId: context!.tenantId,
          code: { in: [ACCOUNT_CODES.SALES_REVENUE, ACCOUNT_CODES.SERVICE_REVENUE, ACCOUNT_CODES.COGS, ACCOUNT_CODES.INVENTORY] },
        },
        select: { id: true, code: true },
      })
      const byCode = Object.fromEntries(accountRows.map(a => [a.code, a.id]))
      defaultSalesRevId   = byCode[ACCOUNT_CODES.SALES_REVENUE]  ?? null
      defaultServiceRevId = byCode[ACCOUNT_CODES.SERVICE_REVENUE] ?? null
      defaultCogsId       = byCode[ACCOUNT_CODES.COGS]            ?? null
      defaultInvId        = byCode[ACCOUNT_CODES.INVENTORY]       ?? null
    }

    const saleJournalLines: SaleLineBreakdown[] = sale.items.map(si => {
      const item = si.item
      const revenue = round2(si.lineSubtotalAmount ?? Math.max(0, si.price * si.quantity - (si.discountAmount ?? 0)))
      const taxLines = si.taxLines.map((taxLine) => ({
        taxPayableAccountId: taxLine.taxRate?.taxPayableAccountId ?? null,
        taxAmount: taxLine.taxAmount,
        taxName: taxLine.taxName,
      }))

      if (item.itemType === 'INVENTORY') {
        const cogs = round2((item.costPrice ?? 0) * si.quantity)
        return {
          revenueAccountId: item.incomeAccountId ?? defaultSalesRevId ?? '',
          revenue,
          taxLines,
          cogsAccountId: item.cogsAccountId ?? defaultCogsId ?? null,
          cogs,
          inventoryAccountId: defaultInvId ?? null,
        }
      } else {
        return {
          revenueAccountId: item.incomeAccountId ?? defaultServiceRevId ?? defaultSalesRevId ?? '',
          revenue,
          taxLines,
          cogsAccountId: null,
          cogs: 0,
          inventoryAccountId: null,
        }
      }
    })

    await prisma.$transaction(async (tx) => {
      const saleApproval = await tx.sale.updateMany({
        where: saleWhere,
        data: {
          approvalStatus: ApprovalStatus.APPROVED,
        },
      })
      if (saleApproval.count !== 1) {
        throw new Error('This sale is no longer pending approval.')
      }

      // 2. Reduce item stock — INVENTORY items only
      for (const si of sale.items) {
        if (si.item.itemType !== 'INVENTORY') continue
        const updated = await tx.item.updateMany({
          where: {
            id: si.itemId,
            tenantId: context!.tenantId,
            ...(sale.branchId ? { branchId: sale.branchId } : {}),
            quantity: { gte: si.quantity },
          },
          data: { quantity: { decrement: si.quantity } },
        })
        if (updated.count !== 1) {
          throw new Error(`Insufficient stock to approve sale for "${si.item.name}".`)
        }
      }

      // 3. Update customer balance (credit sales)
      if (creditAmount > 0 && sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balance: { increment: creditAmount } },
        })
      }

      // 4. Post journal (if accounting enabled)
      if (accountingEnabled) {
        await postSaleJournal(tx, {
          tenantId:     context!.tenantId,
          saleId:       id,
          postedById:   context!.user.id,
          totalAmount,
          paidAmount,
          paymentMethod: sale.paymentMethod,
          isCredit:     creditAmount > 0,
          lines:        saleJournalLines,
        })
      }

      // 5. Update the approval record
      await tx.transactionApproval.updateMany({
        where: { saleId: id, status: ApprovalStatus.PENDING },
        data: {
          status: ApprovalStatus.APPROVED,
          approvedById: context!.user.id,
          approvedAt: new Date(),
          ...(note ? { note } : {}),
        },
      })
    })

    const updatedSale = await prisma.sale.findFirst({
      where: {
        id,
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && branchId ? { branchId } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        items: { include: { item: { select: { id: true, name: true } } } },
      },
    })

    return NextResponse.json({ approved: true, sale: updatedSale })
  } catch (err) {
    console.error('Failed to approve sale:', err)
    const message = err instanceof Error ? err.message : 'Failed to approve sale'
    const status = message.includes('pending approval') ? 409 : message.includes('Insufficient stock') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
