import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'
import { buildVisibleQuotationWhere } from '@/lib/quotations/server'
import {
  createSaleFromInput,
  SaleOperationError,
} from '@/lib/sales/createSale'

/**
 * POST /api/quotations/[id]/convert
 * Convert an accepted quotation into a sale.
 * Requires create_sale permission.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error
    const { id } = await params

    const featureError = requireTenantFeature(
      context!.features,
      'enableQuotations'
    )
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'create_sale')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before converting a quotation into a sale.'
    )
    if (branchError) return branchError

    const where = buildVisibleQuotationWhere(context!, { id })
    if (!where) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

    const quotation = await prisma.quotation.findFirst({
      where,
      include: {
        items: {
          include: {
            taxLines: true,
          },
        },
      },
    })
    if (!quotation) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

    if (quotation.status === 'REJECTED' || quotation.status === 'EXPIRED') {
      return NextResponse.json({ error: 'Cannot convert a rejected or expired quotation' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const result = await createSaleFromInput({
      context: context!,
      branchId,
      body: {
        customerId: quotation.customerId,
        paidAmount:
          body.paidAmount !== undefined
            ? body.paidAmount
            : quotation.totalAmount,
        paymentMethod: body.paymentMethod,
        approvalGrant: body.approvalGrant,
        sourceQuotationId: quotation.id,
        items: quotation.items.map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity,
          price: item.price,
          discountAmount: item.discountAmount,
          isTaxable: item.isTaxable,
          taxCalculationType: item.taxCalculationType ?? undefined,
          taxRateIds: item.taxLines.map((taxLine) => taxLine.taxRateId).filter(Boolean) as string[],
        })),
      },
    })

    if (result.status === 'pending') {
      return NextResponse.json(
        {
          requiresApproval: true,
          saleId: result.saleId,
          flags: result.flags,
          message: 'This transaction requires manager approval before it can be completed.',
        },
        { status: 202 }
      )
    }

    return NextResponse.json(result.sale, { status: 201 })
  } catch (err) {
    if (err instanceof SaleOperationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error('Failed to convert quotation:', err)
    return NextResponse.json({ error: 'Failed to convert quotation to sale' }, { status: 500 })
  }
}
