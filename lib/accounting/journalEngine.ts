/**
 * Double-Entry Journal Engine
 *
 * All functions receive a Prisma transaction client and post journal entries
 * atomically alongside the triggering transaction. Each function:
 *   1. Resolves account IDs from codes
 *   2. Builds balanced debit/credit lines
 *   3. Creates JournalEntry + JournalLine records
 *   4. Asserts balance before committing
 */

import { PaymentMethod, ExpenseCategory, JournalSource, StockAdjustmentType, ReturnType, TransferPartyType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import {
  getAccountId,
  nextEntryNumber,
  paymentMethodAccountCode,
  expenseCategoryAccountCode,
  assertBalanced,
  round2,
  ACCOUNT_CODES,
} from './accounts'
import { resolveTaxPayableAccountId } from '@/lib/tax/accounts'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

type JournalLine = {
  accountId: string
  debit: number
  credit: number
  description?: string
}

async function postEntry(
  tx: Tx,
  params: {
    tenantId: string
    postedById: string
    source: JournalSource
    description: string
    lines: JournalLine[]
    saleId?: string
    purchaseId?: string
    customerPaymentId?: string
    supplierPaymentId?: string
    expenseId?: string
    customerReturnId?: string
    supplierReturnId?: string
    stockAdjustmentId?: string
    ledgerTransferId?: string
  }
): Promise<void> {
  assertBalanced(params.lines)
  const entryNumber = await nextEntryNumber(tx, params.tenantId)
  await tx.journalEntry.create({
    data: {
      tenantId:           params.tenantId,
      entryNumber,
      description:        params.description,
      source:             params.source,
      postedById:         params.postedById,
      saleId:             params.saleId,
      purchaseId:         params.purchaseId,
      customerPaymentId:  params.customerPaymentId,
      supplierPaymentId:  params.supplierPaymentId,
      expenseId:          params.expenseId,
      customerReturnId:   params.customerReturnId,
      supplierReturnId:   params.supplierReturnId,
      stockAdjustmentId:  params.stockAdjustmentId,
      ledgerTransferId:   params.ledgerTransferId,
      lines: {
        create: params.lines.map(l => ({
          accountId:   l.accountId,
          debit:       round2(l.debit),
          credit:      round2(l.credit),
          description: l.description,
        })),
      },
    },
  })
}

// ── SALE ───────────────────────────────────────────────────────────────────────

// Per-item breakdown passed from the sales route so the journal can route each
// line to the correct account depending on itemType.
export interface SaleLineBreakdown {
  // Revenue account ID: item.incomeAccountId override, or default SALES_REVENUE / SERVICE_REVENUE
  revenueAccountId: string
  revenue:          number
  taxLines: {
    taxPayableAccountId: string | null
    taxAmount: number
    taxName: string
  }[]
  // COGS only applies to INVENTORY items
  cogsAccountId:    string | null
  cogs:             number
  // Inventory credit only applies to INVENTORY items
  inventoryAccountId: string | null
}

export interface SaleJournalParams {
  tenantId:      string
  postedById:    string
  saleId:        string
  paymentMethod: PaymentMethod
  totalAmount:   number
  paidAmount:    number
  isCredit:      boolean
  lines:         SaleLineBreakdown[]
}

export async function postSaleJournal(tx: Tx, p: SaleJournalParams): Promise<void> {
  const creditAmount = round2(p.totalAmount - p.paidAmount)
  const cashId = await getAccountId(tx, p.tenantId, paymentMethodAccountCode(p.paymentMethod))
  const arId   = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)

  const journalLines: JournalLine[] = []

  if (p.paidAmount > 0) {
    journalLines.push({ accountId: cashId, debit: p.paidAmount, credit: 0, description: 'Cash received' })
  }
  if (creditAmount > 0) {
    journalLines.push({ accountId: arId, debit: creditAmount, credit: 0, description: 'Credit sale receivable' })
  }

  // Revenue credits — grouped by account to keep the entry compact
  const revenueByAccount = new Map<string, number>()
  for (const l of p.lines) {
    revenueByAccount.set(l.revenueAccountId, round2((revenueByAccount.get(l.revenueAccountId) ?? 0) + l.revenue))
  }
  for (const [accountId, amount] of revenueByAccount) {
    if (amount > 0) journalLines.push({ accountId, debit: 0, credit: amount, description: 'Sales revenue' })
  }

  const taxByAccount = new Map<string, number>()
  for (const l of p.lines) {
    for (const taxLine of l.taxLines) {
      if (taxLine.taxAmount <= 0) continue
      const accountId = await resolveTaxPayableAccountId(
        tx,
        p.tenantId,
        taxLine.taxPayableAccountId
      )
      taxByAccount.set(
        accountId,
        round2((taxByAccount.get(accountId) ?? 0) + taxLine.taxAmount)
      )
    }
  }
  for (const [accountId, amount] of taxByAccount) {
    if (amount > 0) {
      journalLines.push({
        accountId,
        debit: 0,
        credit: amount,
        description: 'Tax collected',
      })
    }
  }

  // COGS debit + Inventory credit (INVENTORY items only)
  const cogsByAccount = new Map<string, number>()
  const invByAccount  = new Map<string, number>()
  for (const l of p.lines) {
    if (l.cogsAccountId && l.inventoryAccountId && l.cogs > 0) {
      cogsByAccount.set(l.cogsAccountId, round2((cogsByAccount.get(l.cogsAccountId) ?? 0) + l.cogs))
      invByAccount.set(l.inventoryAccountId, round2((invByAccount.get(l.inventoryAccountId) ?? 0) + l.cogs))
    }
  }
  for (const [accountId, amount] of cogsByAccount) {
    if (amount > 0) journalLines.push({ accountId, debit: amount, credit: 0, description: 'Cost of goods sold' })
  }
  for (const [accountId, amount] of invByAccount) {
    if (amount > 0) journalLines.push({ accountId, debit: 0, credit: amount, description: 'Inventory reduction' })
  }

  await postEntry(tx, {
    tenantId:    p.tenantId,
    postedById:  p.postedById,
    source:      'SALE',
    description: `Sale — ${p.totalAmount.toFixed(2)} (paid: ${p.paidAmount.toFixed(2)}, credit: ${creditAmount.toFixed(2)})`,
    saleId:      p.saleId,
    lines:       journalLines,
  })
}

// ── PURCHASE ───────────────────────────────────────────────────────────────────

// Per-item breakdown so the journal routes each line to the correct debit account.
export interface PurchaseLineBreakdown {
  // INVENTORY → Inventory asset account; NON_INVENTORY → Expense account
  debitAccountId: string
  amount:         number
}

export interface PurchaseJournalParams {
  tenantId:      string
  postedById:    string
  purchaseId:    string
  totalAmount:   number
  paidAmount:    number
  paymentMethod: PaymentMethod
  isCredit:      boolean
  lines:         PurchaseLineBreakdown[]
}

export async function postPurchaseJournal(tx: Tx, p: PurchaseJournalParams): Promise<void> {
  const creditAmount = round2(p.totalAmount - p.paidAmount)
  const apId   = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.ACCOUNTS_PAYABLE)
  const cashId = await getAccountId(tx, p.tenantId, paymentMethodAccountCode(p.paymentMethod))

  const journalLines: JournalLine[] = []

  // Debit side — grouped by account (inventory asset or expense)
  const debitByAccount = new Map<string, number>()
  for (const l of p.lines) {
    debitByAccount.set(l.debitAccountId, round2((debitByAccount.get(l.debitAccountId) ?? 0) + l.amount))
  }
  for (const [accountId, amount] of debitByAccount) {
    if (amount > 0) journalLines.push({ accountId, debit: amount, credit: 0, description: 'Purchase' })
  }

  if (p.paidAmount > 0) {
    journalLines.push({ accountId: cashId, debit: 0, credit: p.paidAmount, description: 'Cash paid to supplier' })
  }
  if (creditAmount > 0) {
    journalLines.push({ accountId: apId, debit: 0, credit: creditAmount, description: 'Credit purchase payable' })
  }

  await postEntry(tx, {
    tenantId:    p.tenantId,
    postedById:  p.postedById,
    source:      'PURCHASE',
    description: `Purchase — ${p.totalAmount.toFixed(2)} (paid: ${p.paidAmount.toFixed(2)}, credit: ${creditAmount.toFixed(2)})`,
    purchaseId:  p.purchaseId,
    lines:       journalLines,
  })
}

// ── CUSTOMER PAYMENT ───────────────────────────────────────────────────────────

export interface CustomerPaymentJournalParams {
  tenantId:          string
  postedById:        string
  customerPaymentId: string
  amount:            number
  paymentMethod:     PaymentMethod
}

export async function postCustomerPaymentJournal(tx: Tx, p: CustomerPaymentJournalParams): Promise<void> {
  const cashId = await getAccountId(tx, p.tenantId, paymentMethodAccountCode(p.paymentMethod))
  const arId   = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)

  await postEntry(tx, {
    tenantId:          p.tenantId,
    postedById:        p.postedById,
    source:            'CUSTOMER_PAYMENT',
    description:       `Customer payment — ${p.amount.toFixed(2)}`,
    customerPaymentId: p.customerPaymentId,
    lines: [
      { accountId: cashId, debit: p.amount, credit: 0, description: 'Cash received from customer' },
      { accountId: arId,   debit: 0, credit: p.amount, description: 'Accounts receivable reduced' },
    ],
  })
}

// ── SUPPLIER PAYMENT ───────────────────────────────────────────────────────────

export interface SupplierPaymentJournalParams {
  tenantId:          string
  postedById:        string
  supplierPaymentId: string
  amount:            number
  paymentMethod:     PaymentMethod
}

export async function postSupplierPaymentJournal(tx: Tx, p: SupplierPaymentJournalParams): Promise<void> {
  const apId   = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.ACCOUNTS_PAYABLE)
  const cashId = await getAccountId(tx, p.tenantId, paymentMethodAccountCode(p.paymentMethod))

  await postEntry(tx, {
    tenantId:          p.tenantId,
    postedById:        p.postedById,
    source:            'SUPPLIER_PAYMENT',
    description:       `Supplier payment — ${p.amount.toFixed(2)}`,
    supplierPaymentId: p.supplierPaymentId,
    lines: [
      { accountId: apId,   debit: p.amount, credit: 0, description: 'Accounts payable reduced' },
      { accountId: cashId, debit: 0, credit: p.amount, description: 'Cash paid to supplier' },
    ],
  })
}

// ── EXPENSE ────────────────────────────────────────────────────────────────────

export interface ExpenseJournalParams {
  tenantId:      string
  postedById:    string
  expenseId:     string
  amount:        number
  category:      ExpenseCategory
  paymentMethod: PaymentMethod
}

export async function postExpenseJournal(tx: Tx, p: ExpenseJournalParams): Promise<void> {
  const expAcctId = await getAccountId(tx, p.tenantId, expenseCategoryAccountCode(p.category))
  const cashId    = await getAccountId(tx, p.tenantId, paymentMethodAccountCode(p.paymentMethod))

  await postEntry(tx, {
    tenantId:   p.tenantId,
    postedById: p.postedById,
    source:     'EXPENSE',
    description: `Expense — ${p.category} — ${p.amount.toFixed(2)}`,
    expenseId:  p.expenseId,
    lines: [
      { accountId: expAcctId, debit: p.amount, credit: 0, description: `${p.category} expense` },
      { accountId: cashId,    debit: 0, credit: p.amount, description: 'Cash paid' },
    ],
  })
}

// ── CUSTOMER RETURN ────────────────────────────────────────────────────────────

export interface CustomerReturnJournalParams {
  tenantId:         string
  postedById:       string
  customerReturnId: string
  returnType:       ReturnType
  subtotalAmount:   number
  returnAmount:     number
  taxLines?: {
    taxPayableAccountId: string | null
    taxAmount: number
    taxName: string
  }[]
  itemCostPrice:    number
  quantity:         number
  isInventoryItem:  boolean
}

export async function postCustomerReturnJournal(tx: Tx, p: CustomerReturnJournalParams): Promise<void> {
  const costAmount = round2(p.itemCostPrice * p.quantity)
  const returnsId = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.SALES_RETURNS)
  const arId      = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)
  const cashId    = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.CASH_ON_HAND)
  const subtotalAmount = round2(Math.max(0, p.subtotalAmount))
  const taxLines = p.taxLines?.filter((taxLine) => taxLine.taxAmount > 0) ?? []

  const lines: JournalLine[] = []

  if (p.returnType === 'CASH') {
    lines.push({ accountId: returnsId, debit: subtotalAmount || p.returnAmount, credit: 0, description: 'Sales return (cash refund)' })
    lines.push({ accountId: cashId,    debit: 0,               credit: p.returnAmount, description: 'Cash refunded to customer' })
  } else if (p.returnType === 'CREDIT') {
    lines.push({ accountId: returnsId, debit: subtotalAmount || p.returnAmount, credit: 0, description: 'Sales return (credit note)' })
    lines.push({ accountId: arId,      debit: 0,               credit: p.returnAmount, description: 'AR credit applied' })
  } else if (p.returnType === 'EXCHANGE') {
    // No revenue/cash movement — item swapped for a replacement.
  }

  if (p.returnType !== 'EXCHANGE') {
    for (const taxLine of taxLines) {
      const accountId = await resolveTaxPayableAccountId(
        tx,
        p.tenantId,
        taxLine.taxPayableAccountId
      )
      lines.push({
        accountId,
        debit: taxLine.taxAmount,
        credit: 0,
        description: `${taxLine.taxName} reversed`,
      })
    }
  }

  // Restore inventory and reverse COGS only for INVENTORY items
  if (p.isInventoryItem && costAmount > 0) {
    const cogsId = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.COGS)
    const invId  = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.INVENTORY)
    lines.push({ accountId: invId,  debit: costAmount, credit: 0,           description: 'Inventory restored' })
    lines.push({ accountId: cogsId, debit: 0,           credit: costAmount, description: 'COGS reversed' })
  }

  if (lines.length === 0) return

  await postEntry(tx, {
    tenantId:        p.tenantId,
    postedById:      p.postedById,
    source:          'CUSTOMER_RETURN',
    description:     `Customer return (${p.returnType}) — ${p.returnAmount.toFixed(2)}`,
    customerReturnId: p.customerReturnId,
    lines,
  })
}

// ── SUPPLIER RETURN ────────────────────────────────────────────────────────────

export interface SupplierReturnJournalParams {
  tenantId:        string
  postedById:      string
  supplierReturnId: string
  returnType:       ReturnType
  returnAmount:     number
  itemCostPrice:    number
  quantity:         number
  isInventoryItem:  boolean
}

export async function postSupplierReturnJournal(tx: Tx, p: SupplierReturnJournalParams): Promise<void> {
  const costAmount = round2(p.itemCostPrice * p.quantity)
  const apId   = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.ACCOUNTS_PAYABLE)
  const cashId = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.CASH_ON_HAND)

  const lines: JournalLine[] = []

  if (p.returnType === 'CASH') {
    lines.push({ accountId: cashId, debit: p.returnAmount, credit: 0, description: 'Cash refund from supplier' })
  } else if (p.returnType === 'CREDIT') {
    lines.push({ accountId: apId, debit: p.returnAmount, credit: 0, description: 'AP credit from supplier' })
  }
  // EXCHANGE: no financial movement until replacement received

  // Remove from inventory and handle cost variance only for INVENTORY items
  if (p.isInventoryItem && costAmount > 0 && p.returnType !== 'EXCHANGE') {
    const invId  = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.INVENTORY)
    const gainId = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.INVENTORY_ADJUSTMENT_GAIN)
    const lossId = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.INVENTORY_ADJUSTMENT_LOSS)
    const variance = round2(p.returnAmount - costAmount)

    lines.push({ accountId: invId, debit: 0, credit: costAmount, description: 'Inventory removed (returned)' })

    if (variance > 0) {
      lines.push({ accountId: gainId, debit: 0, credit: variance, description: 'Supplier return recovery above cost' })
    } else if (variance < 0) {
      lines.push({ accountId: lossId, debit: Math.abs(variance), credit: 0, description: 'Supplier return shortfall below cost' })
    }
  } else if (!p.isInventoryItem && p.returnType !== 'EXCHANGE') {
    // NON_INVENTORY/SERVICE: the return simply reverses the earlier expense debit
    const expId = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.OTHER_EXPENSES)
    lines.push({ accountId: expId, debit: 0, credit: p.returnAmount, description: 'Expense reversed on supplier return' })
  }

  if (lines.length === 0) return

  await postEntry(tx, {
    tenantId:        p.tenantId,
    postedById:      p.postedById,
    source:          'SUPPLIER_RETURN',
    description:     `Supplier return (${p.returnType}) — ${p.returnAmount.toFixed(2)}`,
    supplierReturnId: p.supplierReturnId,
    lines,
  })
}

// ── STOCK ADJUSTMENT ───────────────────────────────────────────────────────────

export interface StockAdjustmentJournalParams {
  tenantId:          string
  postedById:        string
  stockAdjustmentId: string
  adjustmentType:    StockAdjustmentType
  quantity:          number
  itemCostPrice:     number
}

export async function postStockAdjustmentJournal(tx: Tx, p: StockAdjustmentJournalParams): Promise<void> {
  const value = round2(p.quantity * p.itemCostPrice)
  if (value === 0) return

  const invId  = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.INVENTORY)
  const gainId = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.INVENTORY_ADJUSTMENT_GAIN)
  const lossId = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.INVENTORY_ADJUSTMENT_LOSS)

  const lines: JournalLine[] = p.adjustmentType === 'INCREASE'
    ? [
        { accountId: invId,  debit: value, credit: 0,     description: 'Stock increase' },
        { accountId: gainId, debit: 0,     credit: value, description: 'Inventory adjustment gain' },
      ]
    : [
        { accountId: lossId, debit: value, credit: 0,     description: 'Stock decrease loss' },
        { accountId: invId,  debit: 0,     credit: value, description: 'Inventory reduction' },
      ]

  await postEntry(tx, {
    tenantId:          p.tenantId,
    postedById:        p.postedById,
    source:            'STOCK_ADJUSTMENT',
    description:       `Stock adjustment (${p.adjustmentType}) — qty: ${p.quantity}`,
    stockAdjustmentId: p.stockAdjustmentId,
    lines,
  })
}

// ── MANUAL JOURNAL ─────────────────────────────────────────────────────────────

export interface ManualJournalLine {
  accountId:    string
  debit:        number
  credit:       number
  description?: string
}

export interface ManualJournalParams {
  tenantId:    string
  postedById:  string
  description: string
  date?:       Date
  lines:       ManualJournalLine[]
}

export async function postManualJournal(tx: Tx, p: ManualJournalParams): Promise<string> {
  assertBalanced(p.lines)
  const entryNumber = await nextEntryNumber(tx, p.tenantId)
  const entry = await tx.journalEntry.create({
    data: {
      tenantId:    p.tenantId,
      entryNumber,
      date:        p.date ?? new Date(),
      description: p.description,
      source:      'MANUAL',
      postedById:  p.postedById,
      lines: {
        create: p.lines.map(l => ({
          accountId:   l.accountId,
          debit:       round2(l.debit),
          credit:      round2(l.credit),
          description: l.description,
        })),
      },
    },
  })
  return entry.id
}

// ── REVERSAL ───────────────────────────────────────────────────────────────────

export async function reverseJournalEntry(
  tx: Tx,
  originalId: string,
  postedById: string,
): Promise<string> {
  const original = await tx.journalEntry.findUnique({
    where: { id: originalId },
    include: { lines: true },
  })
  if (!original) throw new Error(`Journal entry ${originalId} not found`)
  if (original.status !== 'POSTED') throw new Error('Only POSTED entries can be reversed')

  const entryNumber = await nextEntryNumber(tx, original.tenantId)

  const reversalEntry = await tx.journalEntry.create({
    data: {
      tenantId:     original.tenantId,
      entryNumber,
      description:  `REVERSAL of ${original.entryNumber}: ${original.description}`,
      source:       JournalSource.MANUAL,  // Reversals are always MANUAL to avoid double-counting in source filters
      status:       'POSTED',
      reversalOfId: original.id,
      postedById,
      lines: {
        create: original.lines.map(l => ({
          accountId:   l.accountId,
          debit:       round2(l.credit),
          credit:      round2(l.debit),
          description: `Reversal: ${l.description ?? ''}`,
        })),
      },
    },
  })

  await tx.journalEntry.update({
    where: { id: original.id },
    data:  { status: 'REVERSED', reversedById: reversalEntry.id },
  })

  return reversalEntry.id
}

// ── PAYROLL ────────────────────────────────────────────────────────────────────

export interface PayrollJournalParams {
  tenantId:       string
  postedById:     string
  payrollRunId:   string
  periodLabel:    string   // e.g. "January 2025"
  totalGross:     number
  totalSSFEmployee: number
  totalSSFEmployer: number
  totalTier2Employer: number
  totalPAYE:      number
  totalOtherDeductions: number
  totalNetPay:    number
  paymentMethod:  PaymentMethod
}

export async function postPayrollJournal(tx: Tx, p: PayrollJournalParams): Promise<string> {
  const salariesExpId   = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.SALARIES_EXPENSE)
  const ssfExpId        = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.SSF_EMPLOYER_EXPENSE)
  const cashAccountId   = await getAccountId(tx, p.tenantId, paymentMethodAccountCode(p.paymentMethod))
  const ssfPayId        = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.SSF_PAYABLE)
  const tier2PayId      = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.TIER2_PENSION_PAYABLE)
  const payePayId       = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.PAYE_PAYABLE)
  const otherDedPayId   = p.totalOtherDeductions > 0
    ? await getAccountId(tx, p.tenantId, ACCOUNT_CODES.OTHER_PAYROLL_DEDUCTIONS_PAYABLE)
    : null

  const totalTier1Payable = round2(p.totalSSFEmployee + (p.totalSSFEmployer - p.totalTier2Employer))

  const lines: JournalLine[] = [
    // Debits (expenses)
    { accountId: salariesExpId, debit: p.totalGross,        credit: 0, description: `Gross wages — ${p.periodLabel}` },
    { accountId: ssfExpId,      debit: p.totalSSFEmployer,  credit: 0, description: `Employer SSF 13% — ${p.periodLabel}` },
    // Credits (cash + liabilities)
    { accountId: cashAccountId, debit: 0, credit: p.totalNetPay,    description: `Net payroll paid via ${p.paymentMethod} — ${p.periodLabel}` },
    { accountId: ssfPayId,      debit: 0, credit: totalTier1Payable, description: `First-tier pension payable — ${p.periodLabel}` },
    { accountId: tier2PayId,    debit: 0, credit: p.totalTier2Employer, description: `Tier 2 pension payable — ${p.periodLabel}` },
    { accountId: payePayId,     debit: 0, credit: p.totalPAYE,      description: `PAYE payable — ${p.periodLabel}` },
  ]

  if (otherDedPayId && p.totalOtherDeductions > 0) {
    lines.push({
      accountId: otherDedPayId,
      debit: 0,
      credit: p.totalOtherDeductions,
      description: `Other payroll deductions withheld — ${p.periodLabel}`,
    })
  }

  // Verify balance:
  // debits  = gross wages + employer pension cost
  // credits = net payroll paid + first-tier payable + tier 2 payable + PAYE payable + other deductions payable
  assertBalanced(lines)

  const entryNumber = await nextEntryNumber(tx, p.tenantId)
  const entry = await tx.journalEntry.create({
    data: {
      tenantId:     p.tenantId,
      entryNumber,
      description:  `Payroll — ${p.periodLabel}`,
      source:       JournalSource.PAYROLL,
      postedById:   p.postedById,
      payrollRunId: p.payrollRunId,
      lines: {
        create: lines.map(l => ({
          accountId:   l.accountId,
          debit:       round2(l.debit),
          credit:      round2(l.credit),
          description: l.description,
        })),
      },
    },
    select: { id: true },
  })

  return entry.id
}

// ── LEDGER TRANSFER ────────────────────────────────────────────────────────────

export interface LedgerTransferJournalParams {
  tenantId:         string
  postedById:       string
  ledgerTransferId: string
  amount:           number
  debitPartyType:   TransferPartyType
  debitAccountId?:  string
  creditPartyType:  TransferPartyType
  creditAccountId?: string
  description:      string
}

export async function postLedgerTransfer(tx: Tx, p: LedgerTransferJournalParams): Promise<string> {
  const arId = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)
  const apId = await getAccountId(tx, p.tenantId, ACCOUNT_CODES.ACCOUNTS_PAYABLE)

  const resolveId = async (partyType: TransferPartyType, directId?: string): Promise<string> => {
    if (partyType === TransferPartyType.ACCOUNT) return directId!
    if (partyType === TransferPartyType.CUSTOMER) return arId
    return apId
  }

  const debitAcctId  = await resolveId(p.debitPartyType,  p.debitAccountId)
  const creditAcctId = await resolveId(p.creditPartyType, p.creditAccountId)

  assertBalanced([
    { debit: p.amount, credit: 0 },
    { debit: 0, credit: p.amount },
  ])

  const entryNumber = await nextEntryNumber(tx, p.tenantId)
  const entry = await tx.journalEntry.create({
    data: {
      tenantId:         p.tenantId,
      entryNumber,
      description:      p.description,
      source:           JournalSource.TRANSFER,
      postedById:       p.postedById,
      ledgerTransferId: p.ledgerTransferId,
      lines: {
        create: [
          { accountId: debitAcctId,  debit: round2(p.amount), credit: 0,               description: 'Transfer debit' },
          { accountId: creditAcctId, debit: 0,                credit: round2(p.amount), description: 'Transfer credit' },
        ],
      },
    },
    select: { id: true },
  })
  return entry.id
}
