import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/trial-balance
 * Returns debit/credit totals for every account with activity in the period.
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

    const lines = await prisma.journalLine.findMany({
      where: { journalEntry: entryWhere },
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true, normalBalance: true },
        },
      },
    })

    // Aggregate by account
    const map = new Map<string, { account: typeof lines[0]['account']; totalDebit: number; totalCredit: number }>()
    for (const line of lines) {
      const key = line.accountId
      if (!map.has(key)) {
        map.set(key, { account: line.account, totalDebit: 0, totalCredit: 0 })
      }
      const entry = map.get(key)!
      entry.totalDebit  = round2(entry.totalDebit  + line.debit)
      entry.totalCredit = round2(entry.totalCredit + line.credit)
    }

    const rows = Array.from(map.values())
      .map(r => ({
        accountId:    r.account.id,
        code:         r.account.code,
        name:         r.account.name,
        type:         r.account.type,
        normalBalance: r.account.normalBalance,
        totalDebit:   r.totalDebit,
        totalCredit:  r.totalCredit,
        balance:      r.account.normalBalance === 'DEBIT'
          ? round2(r.totalDebit - r.totalCredit)
          : round2(r.totalCredit - r.totalDebit),
      }))
      .sort((a, b) => a.code.localeCompare(b.code))

    const grandTotalDebit  = round2(rows.reduce((s, r) => s + r.totalDebit,  0))
    const grandTotalCredit = round2(rows.reduce((s, r) => s + r.totalCredit, 0))

    return NextResponse.json({
      rows,
      totals: { totalDebit: grandTotalDebit, totalCredit: grandTotalCredit },
      balanced: Math.abs(grandTotalDebit - grandTotalCredit) < 0.01,
    })
  } catch (err) {
    console.error('Failed to generate trial balance:', err)
    return NextResponse.json({ error: 'Failed to generate trial balance' }, { status: 500 })
  }
}
