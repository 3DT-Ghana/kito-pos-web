import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { ApprovalStatus } from '@prisma/client'
import { verifyApprovalGrant } from '@/lib/approvals/inlineGrant'
import { postSaleJournal, SaleLineBreakdown } from '@/lib/accounting/journalEngine'
import { round2, ACCOUNT_CODES } from '@/lib/accounting/accounts'

/**
 * POST /api/sales/[id]/approve-with-grant
 * Approve a pending POS sale using a PIN-derived grant token.
 * Does NOT require approve_transactions session permission — the grant itself
 * proves a manager entered their PIN on the cashier's device.
 *
 * Body: { grant: string }
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = session.user.tenantId
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const { grant } = body

    if (!grant || typeof grant !== 'string') {
      return NextResponse.json({ error: 'Approval grant is required' }, { status: 400 })
    }

    // Fetch the sale first so we know its branchId for grant verification
    const sale = await prisma.sale.findFirst({
      where: { id, tenantId, approvalStatus: ApprovalStatus.PENDING },
      include: {
        items: {
          include: {
            item: true,
            taxLines: {
              include: { taxRate: { select: { id: true, taxPayableAccountId: true } } },
            },
          },
        },
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Pending sale not found' }, { status: 404 })
    }

    const verifiedGrant = verifyApprovalGrant(grant, {
      tenantId,
      branchId: sale.branchId ?? null,
      scope: 'SALE',
    })

    if (!verifiedGrant) {
      return NextResponse.json(
        { error: 'Manager approval has expired or is invalid. Please verify PIN again.' },
        { status: 403 }
      )
    }

    const tenantSettings = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { enableAccounting: true },
    })
    const accountingEnabled = tenantSettings?.enableAccounting ?? false

    let defaultSalesRevId: string | null = null
    let defaultServiceRevId: string | null = null
    let defaultCogsId: string | null = null
    let defaultInvId: string | null = null

    if (accountingEnabled) {
      const accountRows = await prisma.account.findMany({
        where: {
          tenantId,
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

    const totalAmount  = sale.totalAmount
    const paidAmount   = sale.paidAmount
    const creditAmount = totalAmount - paidAmount

    const saleJournalLines: SaleLineBreakdown[] = sale.items.map(si => {
      const item    = si.item
      const revenue = round2(si.lineSubtotalAmount ?? Math.max(0, si.price * si.quantity - (si.discountAmount ?? 0)))
      const taxLines = si.taxLines.map(tl => ({
        taxPayableAccountId: tl.taxRate?.taxPayableAccountId ?? null,
        taxAmount: tl.taxAmount,
        taxName: tl.taxName,
      }))

      if (item.itemType === 'INVENTORY') {
        return {
          revenueAccountId: item.incomeAccountId ?? defaultSalesRevId ?? '',
          revenue,
          taxLines,
          cogsAccountId: item.cogsAccountId ?? defaultCogsId ?? null,
          cogs: round2((item.costPrice ?? 0) * si.quantity),
          inventoryAccountId: defaultInvId ?? null,
        }
      }
      return {
        revenueAccountId: item.incomeAccountId ?? defaultServiceRevId ?? defaultSalesRevId ?? '',
        revenue,
        taxLines,
        cogsAccountId: null,
        cogs: 0,
        inventoryAccountId: null,
      }
    })

    const saleWhere = { id, tenantId, approvalStatus: ApprovalStatus.PENDING }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.sale.updateMany({
        where: saleWhere,
        data: { approvalStatus: ApprovalStatus.APPROVED },
      })
      if (updated.count !== 1) {
        throw new Error('This sale is no longer pending approval.')
      }

      for (const si of sale.items) {
        if (si.item.itemType !== 'INVENTORY') continue
        const stockUpdate = await tx.item.updateMany({
          where: {
            id: si.itemId,
            tenantId,
            ...(sale.branchId ? { branchId: sale.branchId } : {}),
            quantity: { gte: si.quantity },
          },
          data: { quantity: { decrement: si.quantity } },
        })
        if (stockUpdate.count !== 1) {
          throw new Error(`Insufficient stock to approve sale for "${si.item.name}".`)
        }
      }

      if (creditAmount > 0 && sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balance: { increment: creditAmount } },
        })
      }

      if (accountingEnabled) {
        await postSaleJournal(tx, {
          tenantId,
          saleId: id,
          postedById: verifiedGrant.approverId,
          totalAmount,
          paidAmount,
          paymentMethod: sale.paymentMethod,
          isCredit: creditAmount > 0,
          lines: saleJournalLines,
        })
      }

      await tx.transactionApproval.updateMany({
        where: { saleId: id, status: ApprovalStatus.PENDING },
        data: {
          status: ApprovalStatus.APPROVED,
          approvedById: verifiedGrant.approverId,
          approvedAt: new Date(),
          note: `Approved via PIN on POS terminal by ${verifiedGrant.approverName}`,
        },
      })
    })

    return NextResponse.json({ approved: true })
  } catch (err) {
    console.error('Failed to approve sale with grant:', err)
    const message = err instanceof Error ? err.message : 'Failed to approve sale'
    const status = message.includes('pending approval') || message.includes('Insufficient stock') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
