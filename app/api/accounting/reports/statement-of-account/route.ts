import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/statement-of-account
 * Per-customer statement: opening balance, sales (debits), payments (credits), closing balance.
 *
 * Query params:
 *   customerId: string (required)
 *   startDate, endDate: ISO strings (optional)
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'view_accounting_reports')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId')
    const startDate  = searchParams.get('startDate')
    const endDate    = searchParams.get('endDate')

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: context!.tenantId },
    })

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateFilter: any = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      dateFilter.lte = end
    }

    // Opening balance = all sales, payments, and transfers before startDate
    let openingBalance = 0
    if (startDate) {
      const priorSales = await prisma.sale.findMany({
        where: {
          ...applyBranchScope({ tenantId: context!.tenantId }, context!),
          customerId,
          paymentType: 'CREDIT',
          createdAt: { lt: new Date(startDate) },
          OR: [{ approvalStatus: null }, { approvalStatus: 'APPROVED' }],
        },
        select: { totalAmount: true, paidAmount: true },
      })
      const priorPayments = await prisma.customerPayment.findMany({
        where: {
          ...applyBranchScope({ tenantId: context!.tenantId }, context!),
          customerId,
          createdAt: { lt: new Date(startDate) },
        },
        select: { amount: true },
      })
      const priorTransfers = await prisma.ledgerTransfer.findMany({
        // LedgerTransfer has no branchId column — ledger entries are recorded
        // at business level — so this stays tenant-scoped.
        where: {
          tenantId: context!.tenantId,
          OR: [{ debitCustomerId: customerId }, { creditCustomerId: customerId }],
          date: { lt: new Date(startDate) },
        },
        select: { amount: true, debitCustomerId: true, creditCustomerId: true },
      })
      const priorSaleTotal     = priorSales.reduce((s, r) => s + r.totalAmount - r.paidAmount, 0)
      const priorPayTotal      = priorPayments.reduce((s, r) => s + r.amount, 0)
      const priorTransferDelta = priorTransfers.reduce((s, t) => {
        if (t.debitCustomerId === customerId)  return s + t.amount  // debit → owes more
        if (t.creditCustomerId === customerId) return s - t.amount  // credit → owes less
        return s
      }, 0)
      openingBalance = round2(priorSaleTotal - priorPayTotal + priorTransferDelta)
    }

    // Sales in period
    const sales = await prisma.sale.findMany({
      where: {
        ...applyBranchScope({ tenantId: context!.tenantId }, context!),
        customerId,
        OR: [{ approvalStatus: null }, { approvalStatus: 'APPROVED' }],
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        createdAt: true,
        totalAmount: true,
        paidAmount: true,
        paymentType: true,
        paymentMethod: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Payments in period
    const payments = await prisma.customerPayment.findMany({
      where: {
        ...applyBranchScope({ tenantId: context!.tenantId }, context!),
        customerId,
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        createdAt: true,
        amount: true,
        method: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Transfers in period involving this customer
    const transfers = await prisma.ledgerTransfer.findMany({
      // Tenant-scoped: LedgerTransfer carries no branchId (see above).
      where: {
        tenantId: context!.tenantId,
        OR: [{ debitCustomerId: customerId }, { creditCustomerId: customerId }],
        ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
      },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        debitPartyType: true,
        debitCustomerId: true,
        creditPartyType: true,
        creditCustomerId: true,
        debitCustomer:  { select: { name: true } },
        creditCustomer: { select: { name: true } },
        debitSupplier:  { select: { name: true } },
        creditSupplier: { select: { name: true } },
        debitAccount:   { select: { name: true, code: true } },
        creditAccount:  { select: { name: true, code: true } },
      },
      orderBy: { date: 'asc' },
    })

    // Merge and sort by date
    type TxLine = {
      date: Date
      type: 'SALE' | 'PAYMENT' | 'RETURN' | 'TRANSFER'
      reference: string
      description: string
      debit: number    // amount owed (charge to customer)
      credit: number   // amount paid (payment from customer)
      balance: number
    }

    const counterpartyLabel = (t: typeof transfers[number]) => {
      if (t.debitCustomerId === customerId) {
        // customer is being debited — the credit side is the counterparty
        if (t.creditCustomer) return t.creditCustomer.name
        if (t.creditSupplier) return t.creditSupplier.name
        if (t.creditAccount)  return `${t.creditAccount.code} ${t.creditAccount.name}`
      } else {
        // customer is being credited — the debit side is the counterparty
        if (t.debitCustomer) return t.debitCustomer.name
        if (t.debitSupplier) return t.debitSupplier.name
        if (t.debitAccount)  return `${t.debitAccount.code} ${t.debitAccount.name}`
      }
      return ''
    }

    const lines: Omit<TxLine, 'balance'>[] = [
      ...sales.map(s => ({
        date: s.createdAt,
        type: 'SALE' as const,
        reference: s.id.slice(-8).toUpperCase(),
        description: s.paymentType === 'CREDIT'
          ? `Credit Sale (${s.paymentMethod})`
          : `Cash Sale (${s.paymentMethod})`,
        debit: round2(s.totalAmount - s.paidAmount),
        credit: s.paidAmount > 0 ? round2(s.paidAmount) : 0,
      })),
      ...payments.map(p => ({
        date: p.createdAt,
        type: 'PAYMENT' as const,
        reference: p.id.slice(-8).toUpperCase(),
        description: `Payment received (${p.method})`,
        debit: 0,
        credit: p.amount,
      })),
      ...transfers.map(t => ({
        date: t.date,
        type: 'TRANSFER' as const,
        reference: t.id.slice(-8).toUpperCase(),
        description: `Transfer: ${t.description}${counterpartyLabel(t) ? ` (${counterpartyLabel(t)})` : ''}`,
        // debit the customer when they are the debit party (balance increases)
        debit:  t.debitCustomerId  === customerId ? round2(t.amount) : 0,
        credit: t.creditCustomerId === customerId ? round2(t.amount) : 0,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime())

    // Apply running balance
    let balance = openingBalance
    const rows: TxLine[] = lines.map(line => {
      balance = round2(balance + line.debit - line.credit)
      return { ...line, balance }
    })

    const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance
    const totalDebits    = round2(rows.reduce((s, r) => s + r.debit,  0))
    const totalCredits   = round2(rows.reduce((s, r) => s + r.credit, 0))

    return NextResponse.json({
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      period: { startDate, endDate },
      openingBalance,
      rows,
      totals: { totalDebits, totalCredits },
      closingBalance,
    })
  } catch (err) {
    console.error('Statement of account error:', err)
    return NextResponse.json({ error: 'Failed to generate statement of account' }, { status: 500 })
  }
}
