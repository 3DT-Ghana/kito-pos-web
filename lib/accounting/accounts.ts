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
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Journal entry is not balanced: debits=${totalDebit} credits=${totalCredit}`
    )
  }
}

// Generate next JE number for the tenant within the given transaction
export async function nextEntryNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  tenantId: string,
): Promise<string> {
  const last = await tx.journalEntry.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: { entryNumber: true },
  })
  const lastNum = last ? parseInt(last.entryNumber.replace('JE-', ''), 10) : 0
  return `JE-${String(lastNum + 1).padStart(4, '0')}`
}
