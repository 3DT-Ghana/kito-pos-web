import { PaymentMethod, ExpenseCategory } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

// Account code constants — kept in sync with seedAccounts.ts
export const ACCOUNT_CODES = {
  CASH_ON_HAND:               '1010',
  CASH_IN_BANK:               '1020',
  MOBILE_MONEY:               '1030',
  ACCOUNTS_RECEIVABLE:        '1100',
  INVENTORY:                  '1200',
  INVENTORY_ADJUSTMENT_GAIN:  '4800',
  ACCOUNTS_PAYABLE:           '2100',
  TAX_PAYABLE:                '2200',
  SALES_REVENUE:              '4100',
  SERVICE_REVENUE:            '4200',
  SALES_RETURNS:              '4900',
  COGS:                       '5100',
  INVENTORY_ADJUSTMENT_LOSS:  '5200',
  RENT_EXPENSE:               '6100',
  SALARIES_EXPENSE:           '6200',
  UTILITIES_EXPENSE:          '6300',
  TRANSPORT_EXPENSE:          '6400',
  MARKETING_EXPENSE:          '6500',
  MAINTENANCE_EXPENSE:        '6600',
  OTHER_EXPENSES:             '6900',
  // Payroll
  SSF_EMPLOYER_EXPENSE:       '6210',  // employer 13% SSF contribution (expense)
  PAYE_PAYABLE:               '2300',  // PAYE withheld, owed to GRA
  SSF_PAYABLE:                '2310',  // first-tier pension / SSNIT payable
  TIER2_PENSION_PAYABLE:      '2315',  // occupational pension payable
  SALARIES_PAYABLE:           '2320',  // net wages payable before bank disbursement
  OTHER_PAYROLL_DEDUCTIONS_PAYABLE: '2330', // loans, advances, and similar payroll deductions
} as const

// Map PaymentMethod → account code
export function paymentMethodAccountCode(method: PaymentMethod): string {
  switch (method) {
    case 'CASH': return ACCOUNT_CODES.CASH_ON_HAND
    case 'BANK': return ACCOUNT_CODES.CASH_IN_BANK
    case 'MOMO': return ACCOUNT_CODES.MOBILE_MONEY
  }
}

// Map ExpenseCategory → account code
export function expenseCategoryAccountCode(category: ExpenseCategory): string {
  switch (category) {
    case 'RENT':        return ACCOUNT_CODES.RENT_EXPENSE
    case 'SALARIES':    return ACCOUNT_CODES.SALARIES_EXPENSE
    case 'UTILITIES':   return ACCOUNT_CODES.UTILITIES_EXPENSE
    case 'TRANSPORT':   return ACCOUNT_CODES.TRANSPORT_EXPENSE
    case 'MARKETING':   return ACCOUNT_CODES.MARKETING_EXPENSE
    case 'MAINTENANCE': return ACCOUNT_CODES.MAINTENANCE_EXPENSE
    case 'OTHER':       return ACCOUNT_CODES.OTHER_EXPENSES
  }
}

// Fetch account id by code for a tenant — throws if not found (schema integrity error)
export async function getAccountId(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  tenantId: string,
  code: string,
): Promise<string> {
  const account = await tx.account.findUnique({
    where: { tenantId_code: { tenantId, code } },
    select: { id: true },
  })
  if (!account) throw new Error(`Account ${code} not found for tenant ${tenantId}. Ensure COA is seeded.`)
  return account.id
}

// Round to 2 decimal places for monetary values
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Assert journal entry is balanced — throws if not
export function assertBalanced(lines: { debit: number; credit: number }[]): void {
  const totalDebit  = round2(lines.reduce((s, l) => s + l.debit,  0))
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0))
  // Totals are already rounded to 2dp, so float noise is gone. A tolerance of
  // a full cent let a genuinely unbalanced entry (100.00 vs 100.01) post and
  // drift the trial balance; compare against half a cent instead.
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Journal entry is not balanced: debits=${totalDebit} credits=${totalCredit}`
    )
  }
}

/**
 * Signed contribution of a journal line to profit, in "increases profit is
 * positive" terms.
 *
 * Contra accounts are the trap: 4900 Sales Returns is type REVENUE with
 * normalBalance DEBIT. Branching on `type` alone and branching on
 * `normalBalance` alone give opposite answers for it, which is exactly how the
 * P&L and the balance sheet came to disagree by 2x the value of every customer
 * return. Both reports now call this, so they cannot diverge.
 */
export function profitContribution(
  account: { type: string; normalBalance: string },
  line: { debit: number; credit: number }
): number {
  // A credit-normal account (revenue) adds to profit when credited; a
  // debit-normal account (expense, COGS, contra-revenue) subtracts when debited.
  return account.normalBalance === 'CREDIT'
    ? round2(line.credit - line.debit)
    : round2(line.debit - line.credit) * -1
}

/**
 * Balance of an account in its own normal direction — the figure a report
 * displays on its own line. Positive means "normal", so a contra-revenue
 * account shows a positive number that nonetheless reduces total revenue.
 */
export function accountNormalBalance(
  account: { normalBalance: string },
  totals: { debit: number; credit: number }
): number {
  return account.normalBalance === 'CREDIT'
    ? round2(totals.credit - totals.debit)
    : round2(totals.debit - totals.credit)
}

/**
 * Generate the next JE number for the tenant within the given transaction.
 *
 * `attempt` shifts the sequence forward so a caller can retry after a unique
 * violation. Two concurrent posts otherwise read the same last number, both
 * compute the same next one, and the loser hits the @@unique([tenantId,
 * entryNumber]) constraint — which rolls back the *entire* enclosing
 * transaction, so a concurrent sale or purchase failed outright with a generic
 * 500 rather than merely renumbering.
 */
export async function nextEntryNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  tenantId: string,
  attempt = 0,
): Promise<string> {
  // Ordered by entryNumber, not createdAt: two entries written in the same
  // millisecond ordered arbitrarily, which could reuse a number.
  const last = await tx.journalEntry.findFirst({
    where: { tenantId },
    orderBy: { entryNumber: 'desc' },
    select: { entryNumber: true },
  })
  const lastNum = last ? parseInt(last.entryNumber.replace('JE-', ''), 10) || 0 : 0
  return `JE-${String(lastNum + 1 + attempt).padStart(4, '0')}`
}

/** True when an error is a Prisma unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}
