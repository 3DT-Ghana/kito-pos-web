import { ReturnType, type TaxCalculationType } from '@prisma/client'
import { round2 } from '@/lib/accounting/accounts'
import { scaleTaxLines } from '@/lib/tax/engine'

/**
 * Shared maths for customer returns.
 *
 * Extracted so the single-item and whole-sale routes cannot drift: a return of
 * one line via either path must produce identical amounts, tax reversal and
 * journal figures. The whole-sale route additionally needs to total these
 * before deciding whether a cash refund is affordable, which is only possible
 * with the per-line calculation separated from the writing.
 */

export interface SaleItemTaxLine {
  taxRateId: string | null
  taxName: string
  taxRatePercentage: number
  taxableAmount: number
  taxAmount: number
  calculationType: TaxCalculationType
  taxRate?: { taxPayableAccountId: string | null } | null
}

export interface SaleItemForReturn {
  id: string
  itemId: string
  quantity: number
  price: number
  discountAmount: number | null
  lineTotalAmount: number | null
  lineSubtotalAmount: number | null
  taxLines: SaleItemTaxLine[]
}

export interface ReturnTaxLine {
  taxRateId: string | null
  taxName: string
  taxRatePercentage: number
  taxableAmount: number
  taxAmount: number
  calculationType: TaxCalculationType
  taxPayableAccountId: string | null
}

export interface ReturnLineResult {
  subtotalAmount: number
  taxAmount: number
  /** Total refundable/creditable value, subtotal + tax. */
  amount: number
  taxLines: ReturnTaxLine[]
}

/** Gross value of a sale line, falling back when the stored total is absent. */
export function lineGrossValue(saleItem: SaleItemForReturn) {
  return (
    saleItem.lineTotalAmount ||
    Math.max(0, saleItem.price * saleItem.quantity - (saleItem.discountAmount ?? 0))
  )
}

/** Value of a sale line before tax, same fallback shape as above. */
export function lineNetValue(saleItem: SaleItemForReturn) {
  return (
    saleItem.lineSubtotalAmount ||
    Math.max(0, saleItem.price * saleItem.quantity - (saleItem.discountAmount ?? 0))
  )
}

/**
 * The most that may be refunded for `quantity` units of this line, after the
 * discount that was actually applied. Returning 2 of 5 units at full list price
 * would otherwise refund more than the customer paid for them.
 */
export function maxReturnAmountFor(saleItem: SaleItemForReturn, quantity: number) {
  const ratio = saleItem.quantity > 0 ? quantity / saleItem.quantity : 0
  return round2(lineGrossValue(saleItem) * ratio)
}

/**
 * Amounts and reversed tax for returning `quantity` units of a sale line.
 *
 * `requestedAmount` lets the operator refund less than the full line value —
 * a restocking deduction, say. It scales the subtotal and tax together so the
 * journal stays balanced; it is never allowed to scale *up*, which the caller
 * enforces against `maxReturnAmountFor`.
 *
 * EXCHANGE reverses no tax: no money moves, so nothing was over-declared.
 */
export function calculateReturnLine(
  saleItem: SaleItemForReturn,
  quantity: number,
  type: ReturnType,
  requestedAmount: number | null
): ReturnLineResult {
  const quantityRatio = saleItem.quantity > 0 ? quantity / saleItem.quantity : 0
  const maxAmount = maxReturnAmountFor(saleItem, quantity)

  const extraScale =
    requestedAmount !== null && maxAmount > 0 ? requestedAmount / maxAmount : 1
  const effectiveScale = quantityRatio * extraScale

  const scaled = scaleTaxLines(
    saleItem.taxLines.map((taxLine) => ({
      taxRateId: taxLine.taxRateId,
      taxName: taxLine.taxName,
      taxRatePercentage: taxLine.taxRatePercentage,
      taxableAmount: taxLine.taxableAmount,
      taxAmount: taxLine.taxAmount,
      calculationType: taxLine.calculationType,
    })),
    effectiveScale
  ).map((taxLine) => ({
    ...taxLine,
    taxPayableAccountId:
      saleItem.taxLines.find((existing) => existing.taxRateId === taxLine.taxRateId)
        ?.taxRate?.taxPayableAccountId ?? null,
  }))

  const postedTaxLines = type === ReturnType.EXCHANGE ? [] : scaled

  let subtotalAmount = round2(lineNetValue(saleItem) * effectiveScale)

  // Honour the requested total exactly: absorb any rounding drift between
  // subtotal and tax into the subtotal, so subtotal + tax equals what the
  // operator asked for rather than a cent either side of it.
  if (requestedAmount !== null) {
    const taxTotal = round2(postedTaxLines.reduce((sum, t) => sum + t.taxAmount, 0))
    const diff = round2(requestedAmount - (subtotalAmount + taxTotal))
    subtotalAmount = round2(Math.max(0, subtotalAmount + diff))
  }

  const taxAmount = round2(postedTaxLines.reduce((sum, t) => sum + t.taxAmount, 0))

  return {
    subtotalAmount,
    taxAmount,
    amount: round2(subtotalAmount + taxAmount),
    taxLines: postedTaxLines,
  }
}
