import { AccountType, NormalBalance } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

// Default Chart of Accounts seeded for every tenant when accounting is first enabled.
// Header accounts (parentCode = null) are non-postable groupings.
// All codes are unique per tenant via the @@unique([tenantId, code]) constraint.

const DEFAULT_COA: Array<{
  code: string
  name: string
  type: AccountType
  normalBalance: NormalBalance
  parentCode: string | null
  isSystemAccount: boolean
  description?: string
}> = [
  // ── Assets ──────────────────────────────────────────────────────────────────
  { code: '1000', name: 'Current Assets',         type: 'ASSET',     normalBalance: 'DEBIT',  parentCode: null,   isSystemAccount: true,  description: 'Header: all current asset accounts' },
  { code: '1010', name: 'Cash on Hand',            type: 'ASSET',     normalBalance: 'DEBIT',  parentCode: '1000', isSystemAccount: true,  description: 'Physical cash at store' },
  { code: '1020', name: 'Cash in Bank',            type: 'ASSET',     normalBalance: 'DEBIT',  parentCode: '1000', isSystemAccount: true,  description: 'Bank account balances' },
  { code: '1030', name: 'Mobile Money (MoMo)',     type: 'ASSET',     normalBalance: 'DEBIT',  parentCode: '1000', isSystemAccount: true,  description: 'MoMo wallet balance' },
  { code: '1100', name: 'Accounts Receivable',     type: 'ASSET',     normalBalance: 'DEBIT',  parentCode: '1000', isSystemAccount: true,  description: 'Amounts owed by customers on credit sales' },
  { code: '1200', name: 'Inventory',               type: 'ASSET',     normalBalance: 'DEBIT',  parentCode: '1000', isSystemAccount: true,  description: 'Inventory asset value at cost' },
  { code: '4800', name: 'Inventory Adjustment Gain', type: 'REVENUE',  normalBalance: 'CREDIT', parentCode: '4000', isSystemAccount: true,  description: 'Gain from stock count increases (found/added inventory)' },

  // ── Liabilities ──────────────────────────────────────────────────────────────
  { code: '2000', name: 'Current Liabilities',    type: 'LIABILITY',  normalBalance: 'CREDIT', parentCode: null,   isSystemAccount: true,  description: 'Header: all current liability accounts' },
  { code: '2100', name: 'Accounts Payable',        type: 'LIABILITY',  normalBalance: 'CREDIT', parentCode: '2000', isSystemAccount: true,  description: 'Amounts owed to suppliers on credit purchases' },
  { code: '2200', name: 'Tax Payable',             type: 'LIABILITY',  normalBalance: 'CREDIT', parentCode: '2000', isSystemAccount: true,  description: 'General tax liability account for collected VAT, GST, levies, and sales taxes' },

  // ── Equity ───────────────────────────────────────────────────────────────────
  { code: '3000', name: 'Equity',                  type: 'EQUITY',     normalBalance: 'CREDIT', parentCode: null,   isSystemAccount: true,  description: 'Header: owner equity accounts' },
  { code: '3100', name: "Owner's Equity",          type: 'EQUITY',     normalBalance: 'CREDIT', parentCode: '3000', isSystemAccount: true,  description: 'Capital contributed by owner' },
  { code: '3200', name: 'Retained Earnings',       type: 'EQUITY',     normalBalance: 'CREDIT', parentCode: '3000', isSystemAccount: true,  description: 'Accumulated net income' },

  // ── Revenue ──────────────────────────────────────────────────────────────────
  { code: '4000', name: 'Revenue',                 type: 'REVENUE',    normalBalance: 'CREDIT', parentCode: null,   isSystemAccount: true,  description: 'Header: all revenue accounts' },
  { code: '4100', name: 'Sales Revenue',           type: 'REVENUE',    normalBalance: 'CREDIT', parentCode: '4000', isSystemAccount: true,  description: 'Revenue from product sales' },
  { code: '4200', name: 'Service Revenue',         type: 'REVENUE',    normalBalance: 'CREDIT', parentCode: '4000', isSystemAccount: true,  description: 'Revenue from services rendered' },
  { code: '4900', name: 'Sales Returns & Allowances', type: 'REVENUE', normalBalance: 'DEBIT',  parentCode: '4000', isSystemAccount: true,  description: 'Contra-revenue: customer returns and refunds' },

  // ── COGS ─────────────────────────────────────────────────────────────────────
  { code: '5000', name: 'Cost of Goods Sold',      type: 'COGS',       normalBalance: 'DEBIT',  parentCode: null,   isSystemAccount: true,  description: 'Header: cost of goods accounts' },
  { code: '5100', name: 'Cost of Goods Sold',      type: 'COGS',       normalBalance: 'DEBIT',  parentCode: '5000', isSystemAccount: true,  description: 'Direct cost of inventory sold' },
  { code: '5200', name: 'Inventory Adjustment Loss', type: 'COGS',     normalBalance: 'DEBIT',  parentCode: '5000', isSystemAccount: true,  description: 'Loss from stock decreases (damage, theft, expiry)' },

  // ── Expenses ──────────────────────────────────────────────────────────────────
  { code: '6000', name: 'Operating Expenses',      type: 'EXPENSE',    normalBalance: 'DEBIT',  parentCode: null,   isSystemAccount: true,  description: 'Header: all operating expense accounts' },
  { code: '6100', name: 'Rent Expense',            type: 'EXPENSE',    normalBalance: 'DEBIT',  parentCode: '6000', isSystemAccount: true },
  { code: '6200', name: 'Salaries Expense',        type: 'EXPENSE',    normalBalance: 'DEBIT',  parentCode: '6000', isSystemAccount: true,  description: 'Gross wages and salaries paid to employees' },
  { code: '6210', name: 'SSF Employer Contribution', type: 'EXPENSE',  normalBalance: 'DEBIT',  parentCode: '6000', isSystemAccount: true,  description: 'Employer 13% SSF/SSNIT Tier 1 contribution' },
  { code: '6300', name: 'Utilities Expense',       type: 'EXPENSE',    normalBalance: 'DEBIT',  parentCode: '6000', isSystemAccount: true },
  { code: '6400', name: 'Transport Expense',       type: 'EXPENSE',    normalBalance: 'DEBIT',  parentCode: '6000', isSystemAccount: true },
  { code: '6500', name: 'Marketing Expense',       type: 'EXPENSE',    normalBalance: 'DEBIT',  parentCode: '6000', isSystemAccount: true },
  { code: '6600', name: 'Maintenance Expense',     type: 'EXPENSE',    normalBalance: 'DEBIT',  parentCode: '6000', isSystemAccount: true },
  { code: '6900', name: 'Other Expenses',          type: 'EXPENSE',    normalBalance: 'DEBIT',  parentCode: '6000', isSystemAccount: true },

  // ── Payroll Liabilities ────────────────────────────────────────────────────────
  { code: '2300', name: 'PAYE Tax Payable',        type: 'LIABILITY',  normalBalance: 'CREDIT', parentCode: '2000', isSystemAccount: true,  description: 'PAYE income tax withheld from employees, owed to GRA' },
  { code: '2310', name: 'SSNIT / First-Tier Payable', type: 'LIABILITY', normalBalance: 'CREDIT', parentCode: '2000', isSystemAccount: true, description: 'First-tier pension contributions payable to SSNIT' },
  { code: '2315', name: 'Tier 2 Pension Payable',  type: 'LIABILITY',  normalBalance: 'CREDIT', parentCode: '2000', isSystemAccount: true,  description: 'Occupational pension contributions payable to the approved custodian' },
  { code: '2320', name: 'Salaries Payable',        type: 'LIABILITY',  normalBalance: 'CREDIT', parentCode: '2000', isSystemAccount: true,  description: 'Net wages payable to employees before bank transfer' },
  { code: '2330', name: 'Other Payroll Deductions Payable', type: 'LIABILITY', normalBalance: 'CREDIT', parentCode: '2000', isSystemAccount: true, description: 'Other payroll deductions withheld from employees such as loans or advances' },
]

// Seeds default COA for a tenant. Safe to call multiple times — skipDuplicates.
export async function seedDefaultAccounts(tenantId: string): Promise<void> {
  const defaultCodes = DEFAULT_COA.map((account) => account.code)
  const existingAccounts = await prisma.account.findMany({
    where: {
      tenantId,
      code: { in: [...defaultCodes, '1210'] },
    },
    select: {
      id: true,
      code: true,
    },
  })
  const existingByCode = new Map(
    existingAccounts.map((account) => [account.code, account] as const)
  )

  // ── One-time migration: fix the old ASSET account 1210 if it exists ──────────
  // Account 1210 was originally seeded as ASSET/DEBIT but should be REVENUE/CREDIT.
  // It has been replaced by 4800. Delete 1210 if it has no posted journal lines.
  const old1210 = existingByCode.get('1210')
  if (old1210) {
    const old1210LineCount = await prisma.journalLine.count({
      where: { accountId: old1210.id },
    })
    if (old1210LineCount === 0) {
      await prisma.account.delete({ where: { id: old1210.id } })
      existingByCode.delete('1210')
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Build code→id map in two passes (headers first, then children)
  const headers = DEFAULT_COA.filter(a => a.parentCode === null)
  const children = DEFAULT_COA.filter(a => a.parentCode !== null)
  const missingHeaders = headers.filter((account) => !existingByCode.has(account.code))

  if (missingHeaders.length > 0) {
    await prisma.account.createMany({
      data: missingHeaders.map((acct) => ({
        tenantId,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        normalBalance: acct.normalBalance,
        isSystemAccount: acct.isSystemAccount,
        description: acct.description ?? null,
      })),
      skipDuplicates: true,
    })
  }

  const parentIdByCode = new Map(
    (
      await prisma.account.findMany({
        where: {
          tenantId,
          code: { in: headers.map((account) => account.code) },
        },
        select: {
          id: true,
          code: true,
        },
      })
    ).map((account) => [account.code, account.id] as const)
  )

  const missingChildren = children.filter((account) => !existingByCode.has(account.code))
  if (missingChildren.length > 0) {
    await prisma.account.createMany({
      data: missingChildren.map((acct) => ({
        tenantId,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        normalBalance: acct.normalBalance,
        parentId: parentIdByCode.get(acct.parentCode!) ?? null,
        isSystemAccount: acct.isSystemAccount,
        description: acct.description ?? null,
      })),
      skipDuplicates: true,
    })
  }
}
