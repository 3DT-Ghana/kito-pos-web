import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/balance-sheet
 * Balance Sheet: Assets = Liabilities + Equity (as-of a given date)
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
    const asOf = searchParams.get('asOf')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entryWhere: any = { tenantId: context!.tenantId, status: 'POSTED' }
    if (asOf) {
      const end = new Date(asOf)
      end.setHours(23, 59, 59, 999)
      entryWhere.date = { lte: end }
    }

    const lines = await prisma.journalLine.findMany({
      where: {
        journalEntry: entryWhere,
        account: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } },
      },
      include: {
        account: { select: { id: true, code: true, name: true, type: true, normalBalance: true } },
      },
    })

    const profitAndLossLines = await prisma.journalLine.findMany({
      where: {
        journalEntry: entryWhere,
        account: { type: { in: ['REVENUE', 'COGS', 'EXPENSE'] } },
      },
      select: {
        debit: true,
        credit: true,
        account: { select: { type: true } },
      },
    })

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
      balance:   r.account.normalBalance === 'DEBIT'
        ? round2(r.debit - r.credit)
        : round2(r.credit - r.debit),
    })).sort((a, b) => a.code.localeCompare(b.code))

    const assets      = rows.filter(r => r.type === 'ASSET')
    const liabilities = rows.filter(r => r.type === 'LIABILITY')
    const equity      = rows.filter(r => r.type === 'EQUITY')

    const totalAssets      = round2(assets.reduce((s, r)      => s + r.balance, 0))
    const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.balance, 0))
    const currentPeriodEarnings = round2(
      profitAndLossLines.reduce((sum, line) => {
        if (line.account.type === 'REVENUE') {
          return round2(sum + (line.credit - line.debit))
        }
        return round2(sum - (line.debit - line.credit))
      }, 0)
    )
    const equityRows = currentPeriodEarnings === 0
      ? equity
      : [
          ...equity,
          {
            accountId: '__current_period_earnings__',
            code: 'CURRENT',
            name: 'Current Period Earnings',
            type: 'EQUITY',
            balance: currentPeriodEarnings,
          },
        ]
    const totalEquity      = round2(equity.reduce((s, r) => s + r.balance, 0) + currentPeriodEarnings)

    return NextResponse.json({
      assets:      { rows: assets,      total: totalAssets },
      liabilities: { rows: liabilities, total: totalLiabilities },
      equity:      { rows: equityRows,  total: totalEquity },
      summary: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        currentPeriodEarnings,
        liabilitiesPlusEquity: round2(totalLiabilities + totalEquity),
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      },
    })
  } catch (err) {
    console.error('Failed to generate balance sheet:', err)
    return NextResponse.json({ error: 'Failed to generate balance sheet' }, { status: 500 })
  }
}
