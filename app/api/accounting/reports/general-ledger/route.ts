import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/general-ledger?accountId=...
 * Returns all journal lines for a single account with running balance.
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
    const accountId = searchParams.get('accountId')
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')

    if (!accountId) {
      return NextResponse.json({ error: 'accountId query parameter is required' }, { status: 400 })
    }

    // Verify account belongs to tenant
    const account = await prisma.account.findFirst({
      where: { id: accountId, tenantId: context!.tenantId },
    })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

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
      where: {
        accountId,
        journalEntry: entryWhere,
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNumber: true,
            date: true,
            description: true,
            source: true,
            status: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { date: 'asc' } },
        { journalEntry: { createdAt: 'asc' } },
      ],
    })

    // Build running balance
    let runningBalance = 0
    const rows = lines.map(line => {
      const net = account.normalBalance === 'DEBIT'
        ? line.debit - line.credit
        : line.credit - line.debit
      runningBalance = round2(runningBalance + net)
      return {
        journalEntryId:     line.journalEntry.id,
        entryNumber:        line.journalEntry.entryNumber,
        date:               line.journalEntry.date,
        description:        line.journalEntry.description,
        source:             line.journalEntry.source,
        lineDescription:    line.description,
        debit:              line.debit,
        credit:             line.credit,
        runningBalance,
      }
    })

    const totalDebit  = round2(lines.reduce((s, l) => s + l.debit,  0))
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0))

    return NextResponse.json({
      account: {
        id:            account.id,
        code:          account.code,
        name:          account.name,
        type:          account.type,
        normalBalance: account.normalBalance,
      },
      rows,
      totals: { totalDebit, totalCredit, closingBalance: runningBalance },
    })
  } catch (err) {
    console.error('Failed to generate general ledger:', err)
    return NextResponse.json({ error: 'Failed to generate general ledger' }, { status: 500 })
  }
}
