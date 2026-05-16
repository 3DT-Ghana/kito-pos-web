import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'
import { buildVisibleQuotationWhere } from '@/lib/quotations/server'
import {
  calculateLineTaxes,
  resolveItemTaxProfile,
} from '@/lib/tax/engine'
import {
  getTenantTaxConfiguration,
  itemTaxSettingInclude,
} from '@/lib/tax/server'

/**
 * GET /api/quotations — list all quotations for tenant
 * POST /api/quotations — create quotation
 */

interface QuotationRequestItem {
  itemId: string
  quantity: number | string
  price?: number | string
  discountAmount?: number | string
  isTaxable?: boolean
  taxRateIds?: string[]
  taxCalculationType?: 'ADD_TO_PRICE' | 'INCLUSIVE'
}

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(
      context!.features,
      'enableQuotations'
    )
    if (featureError) return featureError

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = buildVisibleQuotationWhere(context!)
    if (!where) {
      return NextResponse.json({ quotations: [] })
    }
    if (status) where.status = status

    const quotations = await prisma.quotation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
      },
    })

    // Attach customer names manually (no direct relation on model — just customerId)
    const customerIds = [...new Set(quotations.map(q => q.customerId).filter(Boolean))] as string[]
    const customers = customerIds.length
      ? await prisma.customer.findMany({ where: { id: { in: customerIds }, tenantId: context!.tenantId }, select: { id: true, name: true, phone: true } })
      : []
    const customerMap = Object.fromEntries(customers.map(c => [c.id, c]))

    const result = quotations.map(q => ({
      ...q,
      customer: q.customerId ? (customerMap[q.customerId] ?? null) : null,
    }))

    return NextResponse.json({ quotations: result })
  } catch (err) {
    console.error('Failed to fetch quotations:', err)
    return NextResponse.json({ error: 'Failed to fetch quotations' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(
      context!.features,
      'enableQuotations'
    )
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'create_quotation')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before creating a quotation.'
    )
    if (branchError) return branchError

    const body = await req.json()

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    // Resolve item names from DB for snapshot
    const itemIds = body.items.map((item: QuotationRequestItem) => item.itemId)
    const dbItems = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled ? { branchId } : {}),
      },
      include: itemTaxSettingInclude,
    })
    const itemMap = Object.fromEntries(dbItems.map(i => [i.id, i]))

    if (dbItems.length !== itemIds.length) {
      return NextResponse.json({ error: 'One or more items not found' }, { status: 404 })
    }

    const { taxSetting, activeRates, defaultRates } = await getTenantTaxConfiguration(
      prisma,
      context!.tenantId
    )

    let subtotalAmount = 0
    let taxAmount = 0

    const itemsData = body.items.map((i: QuotationRequestItem) => {
      const item = itemMap[i.itemId]
      const quantity = parseFloat(i.quantity)
      const price = parseFloat(i.price) || item?.sellingPrice || 0
      const discountAmount = Math.max(
        0,
        parseFloat(String(i.discountAmount ?? 0)) || 0
      )

      const taxProfile = resolveItemTaxProfile({
        tenantTaxSetting: taxSetting,
        activeRates,
        defaultRates,
        item,
        override: {
          isTaxable: i.isTaxable,
          taxRateIds: Array.isArray(i.taxRateIds) ? i.taxRateIds : undefined,
          taxCalculationType: i.taxCalculationType,
        },
      })
      const taxComputation = calculateLineTaxes({
        unitPrice: price,
        quantity,
        discountAmount,
        profile: taxProfile,
      })

      subtotalAmount += taxComputation.taxableAmount
      taxAmount += taxComputation.taxAmount

      return {
        id: randomUUID(),
        itemId: i.itemId,
        itemName: item?.name ?? '',
        quantity,
        price,
        discountAmount,
        isTaxable: taxComputation.isTaxable,
        taxCalculationType: taxComputation.calculationType,
        lineSubtotalAmount: taxComputation.taxableAmount,
        lineTaxAmount: taxComputation.taxAmount,
        lineTotalAmount: taxComputation.totalAmount,
        taxLines: taxComputation.taxLines,
      }
    })

    subtotalAmount = Number(subtotalAmount.toFixed(2))
    taxAmount = Number(taxAmount.toFixed(2))
    const totalAmount = Number((subtotalAmount + taxAmount).toFixed(2))

    const quotation = await prisma.quotation.create({
      data: {
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && branchId ? { branchId } : {}),
        customerId: body.customerId || null,
        status: 'DRAFT',
        subtotalAmount,
        taxAmount,
        totalAmount,
        note: body.note || null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        items: {
          create: itemsData.map((item) => ({
            id: item.id,
            itemId: item.itemId,
            itemName: item.itemName,
            quantity: item.quantity,
            price: item.price,
            discountAmount: item.discountAmount,
            isTaxable: item.isTaxable,
            taxCalculationType: item.taxCalculationType,
            lineSubtotalAmount: item.lineSubtotalAmount,
            lineTaxAmount: item.lineTaxAmount,
            lineTotalAmount: item.lineTotalAmount,
          })),
        },
      },
      include: { items: true },
    })

    const transactionTaxLines = itemsData.flatMap((item) =>
      item.taxLines.map((taxLine) => ({
        tenantId: context!.tenantId,
        transactionType: 'QUOTATION' as const,
        transactionId: quotation.id,
        transactionLineId: item.id,
        quotationId: quotation.id,
        quotationItemId: item.id,
        taxRateId: taxLine.taxRateId,
        taxName: taxLine.taxName,
        taxRatePercentage: taxLine.taxRatePercentage,
        taxableAmount: taxLine.taxableAmount,
        taxAmount: taxLine.taxAmount,
        calculationType: taxLine.calculationType,
      }))
    )

    if (transactionTaxLines.length > 0) {
      await prisma.transactionTaxLine.createMany({
        data: transactionTaxLines,
      })
    }

    return NextResponse.json(quotation, { status: 201 })
  } catch (err) {
    console.error('Failed to create quotation:', err)
    return NextResponse.json({ error: 'Failed to create quotation' }, { status: 500 })
  }
}
