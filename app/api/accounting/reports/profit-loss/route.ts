import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/profit-loss
 * Income Statement: Revenue − COGS = Gross Profit − Expenses = Net Income
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
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entryWhere: any = { tenantId: context!.tenantId, status: 'POSTED' }
    if (startDate || endDate) {
      entryWhere.date = {}
      if (startDate) entryWhere.date.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        entryWhere.date.lte = end
      }
    }

    // Fetch all lines for income-statement accounts: REVENUE, COGS, EXPENSE
    const lines = await prisma.journalLine.findMany({
      where: {
        journalEntry: entryWhere,
        account: { type: { in: ['REVENUE', 'COGS', 'EXPENSE'] } },
      },
      include: {
        account: { select: { id: true, code: true, name: true, type: true, normalBalance: true } },
      },
    })

    // Group by account
    const map = new Map<string, { account: typeof lines[0]['account']; debit: number; credit: number }>()
    for (const line of lines) {
      if (!map.has(line.accountId)) {
        map.set(line.accountId, { account: line.account, debit: 0, credit: 0 })
      }
      const e = map.get(line.accountId)!
      e.debit  = round2(e.debit  + line.debit)
      e.credit = round2(e.credit + line.credit)
    }

    const rows = Array.from(map.values()).map(r => ({
      accountId: r.account.id,
      code:      r.account.code,
      name:      r.account.name,
      type:      r.account.type,
      // Net balance in the account's normal direction
      balance:   r.account.normalBalance === 'CREDIT'
        ? round2(r.credit - r.debit)
        : round2(r.debit - r.credit),
    })).sort((a, b) => a.code.localeCompare(b.code))

    const revenue  = rows.filter(r => r.type === 'REVENUE')
    const cogs     = rows.filter(r => r.type === 'COGS')
    const expenses = rows.filter(r => r.type === 'EXPENSE')

    const totalRevenue  = round2(revenue.reduce((s, r)  => s + r.balance, 0))
    const totalCogs     = round2(cogs.reduce((s, r)     => s + r.balance, 0))
    const totalExpenses = round2(expenses.reduce((s, r) => s + r.balance, 0))
    const grossProfit   = round2(totalRevenue - totalCogs)
    const netIncome     = round2(grossProfit - totalExpenses)

    return NextResponse.json({
      revenue:  { rows: revenue,  total: totalRevenue },
      cogs:     { rows: cogs,     total: totalCogs },
      expenses: { rows: expenses, total: totalExpenses },
      summary: {
        totalRevenue,
        totalCogs,
        grossProfit,
        totalExpenses,
        netIncome,
      },
    })
  } catch (err) {
    console.error('Failed to generate profit & loss:', err)
    return NextResponse.json({ error: 'Failed to generate profit & loss report' }, { status: 500 })
  }
}
