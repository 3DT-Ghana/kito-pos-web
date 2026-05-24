import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import { createInvoiceCommissions } from '@/lib/billing/commission'
import type { InvoiceStatus } from '@prisma/client'
import {
  INVOICE_STATUSES,
  canTransitionInvoiceStatus,
} from '@/lib/billing/status'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  const invoice = await prisma.tenantInvoice.findUnique({
    where: { id },
    include: {
      lineItems: true,
      commissions: { include: { agent: { select: { id: true, agentCode: true, fullName: true } } } },
    },
  })

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  return NextResponse.json(invoice)
}

/**
 * PATCH /api/admin/invoices/[id]
 * Update invoice status or notes.
 * Valid transitions: DRAFT → SENT|VOID, SENT → PAID|OVERDUE|VOID, OVERDUE → PAID|VOID.
 * Transitioning to PAID triggers commission generation.
 * Body: { status?, notes? }
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  try {
    const body = await req.json()
    const status = typeof body.status === 'string' ? (body.status as InvoiceStatus) : undefined
    const { notes } = body

    if (status && !INVOICE_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const invoice = await prisma.tenantInvoice.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        tenantId: true,
        tenantName: true,
        paidAt: true,
        plan: { select: { id: true } },
      },
    })

    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    if (
      status &&
      status !== invoice.status &&
      !canTransitionInvoiceStatus(invoice.status, status)
    ) {
      return NextResponse.json(
        {
          error: `Invoice cannot move from ${invoice.status} to ${status}.`,
        },
        { status: 409 }
      )
    }

    const statusChanged = Boolean(status && status !== invoice.status)

    const updated = await prisma.tenantInvoice.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(statusChanged && status === 'PAID' && !invoice.paidAt
          ? { paidAt: new Date() }
          : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      include: { lineItems: true },
    })

    // When invoice moves to PAID, generate commissions for the agent who onboarded this tenant
    if (statusChanged && status === 'PAID') {
      const tenant = await prisma.tenant.findUnique({
        where: { id: invoice.tenantId },
        select: { agentId: true },
      })
      if (tenant?.agentId) {
        await createInvoiceCommissions({
          invoiceId: id,
          agentId: tenant.agentId,
          tenantId: invoice.tenantId,
          tenantName: invoice.tenantName,
        })
      }
    }

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'invoice.status_changed',
        entity: 'TenantInvoice',
        entityId: id,
        details: { status, previous: invoice.status },
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
}
