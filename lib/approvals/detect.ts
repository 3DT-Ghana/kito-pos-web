import { ApprovalFlag } from '@prisma/client'

/**
 * Approval detection utilities.
 *
 * These functions determine whether a transaction by a low-privilege user
 * (CASHIER / STAFF) needs manager approval before side effects are committed.
 *
 * The tenant's `requireApproval` flag must be true for any of this to activate.
 * Users with `approve_transactions` permission bypass the check entirely.
 */

export interface SaleApprovalContext {
  items: { price: number; cataloguePrice: number; discountAmount: number; quantity: number }[]
  orderDiscountAmount: number  // resolved currency amount of order-level discount
  creditAmount: number         // totalAmount - paidAmount
}

export function detectSaleFlags(ctx: SaleApprovalContext): ApprovalFlag[] {
  const flags = new Set<ApprovalFlag>()

  for (const item of ctx.items) {
    if ((item.discountAmount || 0) > 0) {
      flags.add(ApprovalFlag.DISCOUNT)
    }
    if (item.price < item.cataloguePrice - 0.001) {
      flags.add(ApprovalFlag.PRICE_OVERRIDE)
    }
  }

  if (ctx.orderDiscountAmount > 0) {
    flags.add(ApprovalFlag.DISCOUNT)
  }

  if (ctx.creditAmount > 0) {
    flags.add(ApprovalFlag.CREDIT_SALE)
  }

  return Array.from(flags)
}
