import { prisma } from '@/lib/db/prisma'
import type { BillingCycle } from '@prisma/client'
import { isUniqueConstraintError } from '@/lib/db/prismaErrors'
import { InvoiceGenerationError } from '@/lib/billing/errors'
import { INVOICE_BILLING_HISTORY_STATUSES } from '@/lib/billing/status'

interface LineItemInput {
  description: string
  quantity: number
  unitPrice: number
  discount: number    // absolute amount already applied
  vatRate: number     // percentage e.g. 15
  vatAmount: number
  lineTotal: number
  featureId?: string
  itemId?: string
}

interface InvoiceTotals {
  subtotal: number
  vatAmount: number
  discountAmount: number
  total: number
}

export function computeLineTotals(
  unitPrice: number,
  quantity: number,
  discountPct: number,  // percentage
  vatRate: number       // percentage
): { lineSubtotal: number; discountAmount: number; vatAmount: number; lineTotal: number } {
  const gross = unitPrice * quantity
  const discountAmount = parseFloat(((gross * discountPct) / 100).toFixed(2))
  const afterDiscount = gross - discountAmount
  const vatAmount = parseFloat(((afterDiscount * vatRate) / 100).toFixed(2))
  const lineTotal = parseFloat((afterDiscount + vatAmount).toFixed(2))
  return { lineSubtotal: parseFloat(gross.toFixed(2)), discountAmount, vatAmount, lineTotal }
}

export function computeInvoiceTotals(lines: LineItemInput[]): InvoiceTotals {
  let subtotal = 0
  let vatAmount = 0
  let discountAmount = 0

  for (const line of lines) {
    const gross = line.unitPrice * line.quantity
    subtotal += gross
    discountAmount += line.discount
    vatAmount += line.vatAmount
  }

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    vatAmount: parseFloat(vatAmount.toFixed(2)),
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    total: parseFloat((subtotal - discountAmount + vatAmount).toFixed(2)),
  }
}

/** Generate the next sequential invoice number: INV-YYYY-NNNN */
export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const last = await prisma.tenantInvoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  })
  const seq = last ? parseInt(last.invoiceNumber.split('-')[2], 10) : 0
  return `${prefix}${String(seq + 1).padStart(4, '0')}`
}

interface BuildInvoiceParams {
  planId: string
  tenantId: string
  tenantName: string
  billingCycle: BillingCycle
  planDiscountPct: number  // plan-level discount %
  dueDate?: Date
  notes?: string
  createdByEmail?: string
}

async function createInvoiceWithRetry(params: {
  planId: string
  tenantId: string
  tenantName: string
  billingCycle: BillingCycle
  totals: InvoiceTotals
  dueDate?: Date
  notes?: string
  createdByEmail?: string
  lineItems: LineItemInput[]
}) {
  const {
    planId,
    tenantId,
    tenantName,
    billingCycle,
    totals,
    dueDate,
    notes,
    createdByEmail,
    lineItems,
  } = params

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = await generateInvoiceNumber()

    try {
      return await prisma.tenantInvoice.create({
        data: {
          invoiceNumber,
          planId,
          tenantId,
          tenantName,
          billingCycle,
          status: 'DRAFT',
          subtotal: totals.subtotal,
          vatAmount: totals.vatAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          dueDate,
          notes,
          createdByEmail,
          lineItems: {
            create: lineItems.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discount: line.discount,
              vatRate: line.vatRate,
              vatAmount: line.vatAmount,
              lineTotal: line.lineTotal,
              featureId: line.featureId ?? null,
              itemId: line.itemId ?? null,
            })),
          },
        },
        include: { lineItems: true },
      })
    } catch (error) {
      if (isUniqueConstraintError(error, 'invoiceNumber')) {
        continue
      }

      throw error
    }
  }

  throw new Error('Failed to allocate a unique invoice number')
}

/**
 * Builds and saves a DRAFT invoice for a tenant plan.
 * Reads the plan's features and items, computes line items, saves to DB.
 * Returns the created invoice with line items.
 */
export async function buildInvoiceForPlan(params: BuildInvoiceParams) {
  const { planId, tenantId, tenantName, billingCycle, planDiscountPct, dueDate, notes, createdByEmail } = params

  const [plan, previousInvoices] = await Promise.all([
    prisma.tenantBusinessPlan.findUnique({
      where: { id: planId },
      include: {
        features: { include: { feature: true } },
        items: { include: { item: true } },
      },
    }),
    prisma.tenantInvoice.findMany({
      where: {
        planId,
        status: { in: INVOICE_BILLING_HISTORY_STATUSES },
      },
      select: {
        lineItems: {
          select: {
            description: true,
            quantity: true,
            featureId: true,
            itemId: true,
          },
        },
      },
    }),
  ])

  if (!plan) throw new Error('Plan not found')

  const lineItems: LineItemInput[] = []
  const previouslyBilledFeatureIds = new Set<string>()
  const billedOneTimeItemQuantities = new Map<string, number>()

  for (const invoice of previousInvoices) {
    for (const line of invoice.lineItems) {
      if (line.featureId) {
        previouslyBilledFeatureIds.add(line.featureId)
      }

      if (line.itemId) {
        billedOneTimeItemQuantities.set(
          line.itemId,
          (billedOneTimeItemQuantities.get(line.itemId) ?? 0) + line.quantity
        )
      }
    }
  }

  // Feature lines
  for (const pf of plan.features) {
    const f = pf.feature
    const featureDiscountPct = pf.discount ?? f.discount
    const totalDiscountPct = Math.min(100, featureDiscountPct + planDiscountPct)

    let recurringUnitPrice = 0
    if (billingCycle === 'MONTHLY') recurringUnitPrice = pf.monthlyFee ?? f.monthlyFee
    else if (billingCycle === 'YEARLY') recurringUnitPrice = pf.yearlyFee ?? f.yearlyFee
    else if (billingCycle === 'ONE_TIME') recurringUnitPrice = pf.oneTimeFee ?? f.oneTimeFee

    const shouldBillRecurringLine =
      recurringUnitPrice > 0 &&
      (billingCycle !== 'ONE_TIME' || !previouslyBilledFeatureIds.has(f.id))

    if (shouldBillRecurringLine) {
      const { discountAmount, vatAmount, lineTotal } = computeLineTotals(
        recurringUnitPrice,
        1,
        totalDiscountPct,
        f.vatRate
      )

      lineItems.push({
        description: f.name,
        quantity: 1,
        unitPrice: recurringUnitPrice,
        discount: discountAmount,
        vatRate: f.vatRate,
        vatAmount,
        lineTotal,
        featureId: f.id,
      })
    }

    const setupFee = pf.setupFee ?? f.setupFee
    if (setupFee > 0 && !previouslyBilledFeatureIds.has(f.id)) {
      const { discountAmount, vatAmount, lineTotal } = computeLineTotals(
        setupFee,
        1,
        totalDiscountPct,
        f.vatRate
      )

      lineItems.push({
        description: `${f.name} Setup`,
        quantity: 1,
        unitPrice: setupFee,
        discount: discountAmount,
        vatRate: f.vatRate,
        vatAmount,
        lineTotal,
        featureId: f.id,
      })
    }
  }

  // Hardware/item lines
  for (const pi of plan.items) {
    const hw = pi.item
    const isOneTimeItem = hw.billingCycle === 'ONE_TIME'
    const matchesInvoiceCycle = isOneTimeItem || hw.billingCycle === billingCycle

    if (!matchesInvoiceCycle) {
      continue
    }

    const itemDiscountPct = pi.discount ?? 0
    const totalDiscountPct = Math.min(100, itemDiscountPct + planDiscountPct)

    const previouslyBilledQty = billedOneTimeItemQuantities.get(hw.id) ?? 0
    const billableQuantity = isOneTimeItem
      ? Math.max(0, pi.quantity - previouslyBilledQty)
      : pi.quantity

    if (billableQuantity <= 0) {
      continue
    }

    const unitPrice = pi.unitPrice ?? hw.sellingPrice
    const { discountAmount, vatAmount, lineTotal } = computeLineTotals(
      unitPrice,
      billableQuantity,
      totalDiscountPct,
      hw.vatRate
    )

    lineItems.push({
      description: `${hw.name} × ${billableQuantity}`,
      quantity: billableQuantity,
      unitPrice,
      discount: discountAmount,
      vatRate: hw.vatRate,
      vatAmount,
      lineTotal,
      itemId: hw.id,
    })
  }

  if (lineItems.length === 0) {
    throw new InvoiceGenerationError({
      code: 'NO_BILLABLE_ITEMS',
      message:
        'No billable line items remain for this plan. Add recurring charges, or void the earlier issued invoice if you need to bill one-time charges again.',
    })
  }

  const totals = computeInvoiceTotals(lineItems)
  const invoice = await createInvoiceWithRetry({
    planId,
    tenantId,
    tenantName,
    billingCycle,
    totals,
    dueDate,
    notes,
    createdByEmail,
    lineItems,
  })

  return invoice
}
