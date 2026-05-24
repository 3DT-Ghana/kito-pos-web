import type { InvoiceStatus } from '@prisma/client'

export const INVOICE_STATUSES: InvoiceStatus[] = [
  'DRAFT',
  'SENT',
  'PAID',
  'OVERDUE',
  'VOID',
]

export const INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['SENT', 'VOID'],
  SENT: ['PAID', 'OVERDUE', 'VOID'],
  OVERDUE: ['PAID', 'VOID'],
  PAID: [],
  VOID: [],
}

export const INVOICE_BILLING_HISTORY_STATUSES: InvoiceStatus[] = [
  'SENT',
  'PAID',
  'OVERDUE',
]

export function getAllowedInvoiceTransitions(status: InvoiceStatus) {
  return INVOICE_STATUS_TRANSITIONS[status] ?? []
}

export function canTransitionInvoiceStatus(
  currentStatus: InvoiceStatus,
  nextStatus: InvoiceStatus
) {
  return (
    currentStatus === nextStatus ||
    getAllowedInvoiceTransitions(currentStatus).includes(nextStatus)
  )
}
