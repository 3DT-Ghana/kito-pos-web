import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import { buildInvoiceForPlan } from '@/lib/billing/engine'
import { InvoiceGenerationError } from '@/lib/billing/errors'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/admin/tenant-plans/[id]/invoice
 * Generate a new DRAFT invoice for this plan.
 * Body: { dueDate?, notes? }
 */
export async function POST(req: Request, { params }: RouteParams) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  try {
    const body = await req.json().catch(() => ({}))

    const plan = await prisma.tenantBusinessPlan.findFirst({
      where: { OR: [{ id }, { tenantId: id }] },
      select: { id: true, tenantId: true, billingCycle: true, discount: true },
    })

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    const existingDraftInvoice = await prisma.tenantInvoice.findFirst({
      where: {
        planId: plan.id,
        status: 'DRAFT',
      },
      select: {
        id: true,
        invoiceNumber: true,
      },
    })

    if (existingDraftInvoice) {
      return NextResponse.json(
        {
          error: `Draft invoice ${existingDraftInvoice.invoiceNumber} already exists for this plan. Open or void it before generating another invoice.`,
          existingDraftInvoiceId: existingDraftInvoice.id,
          existingDraftInvoiceNumber: existingDraftInvoice.invoiceNumber,
        },
        { status: 409 }
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: plan.tenantId },
      select: { name: true },
    })

    const invoice = await buildInvoiceForPlan({
      planId: plan.id,
      tenantId: plan.tenantId,
      tenantName: tenant?.name ?? 'Unknown',
      billingCycle: plan.billingCycle,
      planDiscountPct: plan.discount,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      notes: body.notes ?? undefined,
      createdByEmail: context!.email,
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (err) {
    if (err instanceof InvoiceGenerationError) {
      return NextResponse.json(
        {
          error: err.message,
          existingDraftInvoiceId: err.existingInvoiceId,
          existingDraftInvoiceNumber: err.existingInvoiceNumber,
        },
        { status: 409 }
      )
    }

    console.error(err)
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 })
  }
}
