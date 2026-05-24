type InvoiceGenerationErrorCode = 'DRAFT_EXISTS' | 'NO_BILLABLE_ITEMS'

interface InvoiceGenerationErrorParams {
  code: InvoiceGenerationErrorCode
  message: string
  existingInvoiceId?: string
  existingInvoiceNumber?: string
}

export class InvoiceGenerationError extends Error {
  readonly code: InvoiceGenerationErrorCode
  readonly existingInvoiceId?: string
  readonly existingInvoiceNumber?: string

  constructor(params: InvoiceGenerationErrorParams) {
    super(params.message)
    this.name = 'InvoiceGenerationError'
    Object.setPrototypeOf(this, new.target.prototype)
    this.code = params.code
    this.existingInvoiceId = params.existingInvoiceId
    this.existingInvoiceNumber = params.existingInvoiceNumber
  }
}
