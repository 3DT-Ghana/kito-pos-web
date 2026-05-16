import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2, ACCOUNT_CODES } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/cash-flow
 * Statement of Cash Flows — Indirect method (QuickBooks standard).
 *
 * Operating Activities:
 *   Net Income (from P&L)
 *   +/- Changes in working capital (AR, AP, Inventory)
 *
 * Investing Activities:
 *   (No fixed assets in this COA — returns empty for now)
 *
 * Financing Activities:
 *   (No long-term debt/equity in this COA — returns empty for now)
 *
 * Query params:
 *   startDate, endDate (ISO strings)
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
    const periodWhere: any = { tenantId: context!.tenantId, status: 'POSTED' }
    if (startDate || endDate) {
      periodWhere.date = {}
      if (startDate) periodWhere.date.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        periodWhere.date.lte = end
      }
    }

    // ── 1. Net Income (Revenue − COGS − Expenses) ───────────────────────────
    const incomeLines = await prisma.journalLine.findMany({
      where: {
        journalEntry: periodWhere,
        account: { type: { in: ['REVENUE', 'COGS', 'EXPENSE'] } },
      },
      select: {
        debit: true,
        credit: true,
        account: { select: { type: true, normalBalance: true } },
      },
    })

    let netIncome = 0
    for (const l of incomeLines) {
      if (l.account.type === 'REVENUE') {
        netIncome = round2(netIncome + (l.credit - l.debit))
      } else {
        netIncome = round2(netIncome - (l.debit - l.credit))
      }
    }

    // ── 2. Working Capital Changes ───────────────────────────────────────────
    // Helper: get period net change for an account code (positive = debit increase for DEBIT accounts)
    async function periodNetChange(code: string): Promise<number> {
      const acct = await prisma.account.findUnique({
        where: { tenantId_code: { tenantId: context!.tenantId, code } },
        select: { id: true, normalBalance: true },
      })
      if (!acct) return 0

      const agg = await prisma.journalLine.aggregate({
        where: { accountId: acct.id, journalEntry: periodWhere },
        _sum: { debit: true, credit: true },
      })

      const debit  = agg._sum.debit  ?? 0
      const credit = agg._sum.credit ?? 0
      return acct.normalBalance === 'DEBIT'
        ? round2(debit - credit)   // increase in DEBIT account = positive change
        : round2(credit - debit)   // increase in CREDIT account = positive change
    }

    const arChange  = await periodNetChange(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)
    const invChange = await periodNetChange(ACCOUNT_CODES.INVENTORY)
    const apChange  = await periodNetChange(ACCOUNT_CODES.ACCOUNTS_PAYABLE)

    // In cash flow: increase in AR = cash NOT collected = subtract
    //               increase in Inventory = cash spent = subtract
    //               increase in AP = cash not yet paid = add
    const arAdjustment  = round2(-arChange)
    const invAdjustment = round2(-invChange)
    const apAdjustment  = apChange  // positive AP change = we owe more = source of cash

    // ── 3. Cash from operations ──────────────────────────────────────────────
    const workingCapitalAdjustments = [
      { label: 'Decrease (Increase) in Accounts Receivable', amount: arAdjustment },
      { label: 'Decrease (Increase) in Inventory', amount: invAdjustment },
      { label: 'Increase (Decrease) in Accounts Payable', amount: apAdjustment },
    ]

    const totalWorkingCapital = round2(
      workingCapitalAdjustments.reduce((s, a) => s + a.amount, 0)
    )

    const netCashFromOperations = round2(netIncome + totalWorkingCapital)

    // ── 4. Cash balances ─────────────────────────────────────────────────────
    // Opening cash = sum of all cash account lines BEFORE the period
    async function cashBalance(beforeDate?: Date): Promise<number> {
      const cashCodes = [
        ACCOUNT_CODES.CASH_ON_HAND,
        ACCOUNT_CODES.CASH_IN_BANK,
        ACCOUNT_CODES.MOBILE_MONEY,
      ]

      const cashAccountIds = await prisma.account.findMany({
        where: { tenantId: context!.tenantId, code: { in: cashCodes } },
        select: { id: true },
      })
      const ids = cashAccountIds.map(a => a.id)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {
        accountId: { in: ids },
        journalEntry: {
          tenantId: context!.tenantId,
          status: 'POSTED',
        },
      }
      if (beforeDate) {
        where.journalEntry.date = { lt: beforeDate }
      }

      const agg = await prisma.journalLine.aggregate({
        where,
        _sum: { debit: true, credit: true },
      })

      return round2((agg._sum.debit ?? 0) - (agg._sum.credit ?? 0))
    }

    const openingCash = startDate ? await cashBalance(new Date(startDate)) : 0
    const closingCash = round2(openingCash + netCashFromOperations)

    return NextResponse.json({
      period: { startDate, endDate },
      operating: {
        netIncome,
        workingCapitalAdjustments,
        totalWorkingCapital,
        netCashFromOperations,
      },
      investing: {
        items: [],
        netCashFromInvesting: 0,
      },
      financing: {
        items: [],
        netCashFromFinancing: 0,
      },
      summary: {
        openingCash,
        netChangeInCash: netCashFromOperations,
        closingCash,
      },
    })
  } catch (err) {
    console.error('Cash flow report error:', err)
    return NextResponse.json({ error: 'Failed to generate cash flow statement' }, { status: 500 })
  }
}
