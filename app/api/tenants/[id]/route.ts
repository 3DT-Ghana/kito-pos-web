import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requireOwner } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { TenantStatus } from '@prisma/client'
import { seedDefaultAccounts } from '@/lib/accounting/seedAccounts'

/**
 * Tenant Management API
 *
 * GET /api/tenants/[id] - Get tenant details
 * PUT /api/tenants/[id] - Update tenant information
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/tenants/[id]
 * Get tenant details
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { error, tenantId } = await requireTenant()
    if (error) return error!

    const { id } = await params

    // Users can only view their own tenant
    if (id !== tenantId) {
      return NextResponse.json(
        { error: 'You can only view your own tenant information' },
        { status: 403 }
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    return NextResponse.json(tenant)
  } catch (err) {
    console.error('Failed to fetch tenant:', err)
    return NextResponse.json(
      { error: 'Failed to fetch tenant' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/tenants/[id]
 * Update tenant information
 * Requires: OWNER role
 */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, tenantId, user } = await requireTenant()
    if (error) return error!

    // Only OWNERs can update tenant
    const { authorized, error: roleError } = requireOwner(user!.role)
    if (!authorized) return roleError!

    const { id } = await params

    // Users can only update their own tenant
    if (id !== tenantId) {
      return NextResponse.json(
        { error: 'You can only update your own tenant information' },
        { status: 403 }
      )
    }

    const body = await req.json()

    // Validate
    if (body.name !== undefined && (!body.name || typeof body.name !== 'string')) {
      return NextResponse.json(
        { error: 'Business name must be a non-empty string' },
        { status: 400 }
      )
    }

    if (body.status !== undefined && !Object.values(TenantStatus).includes(body.status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      )
    }

    if (body.receiptPrinterWidth !== undefined && !['58mm', '80mm'].includes(body.receiptPrinterWidth)) {
      return NextResponse.json(
        { error: 'Receipt printer width must be either 58mm or 80mm' },
        { status: 400 }
      )
    }

    // Update tenant
    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.phone !== undefined && { phone: body.phone ? body.phone.trim() : null }),
        ...(body.status && { status: body.status as TenantStatus }),
        ...(body.showManufacturerOnReceipt !== undefined && { showManufacturerOnReceipt: body.showManufacturerOnReceipt }),
        ...(body.receiptPrinterWidth !== undefined && { receiptPrinterWidth: body.receiptPrinterWidth }),
        ...(body.useUnitSystem !== undefined && { useUnitSystem: Boolean(body.useUnitSystem) }),
        ...(body.enableRetailPrice !== undefined && { enableRetailPrice: Boolean(body.enableRetailPrice) }),
        ...(body.enableWholesalePrice !== undefined && { enableWholesalePrice: Boolean(body.enableWholesalePrice) }),
        ...(body.enablePromoPrice !== undefined && { enablePromoPrice: Boolean(body.enablePromoPrice) }),
        ...(body.enableDiscounts !== undefined && { enableDiscounts: Boolean(body.enableDiscounts) }),
        // SMS settings
        ...(body.enableSmsNotifications !== undefined && { enableSmsNotifications: Boolean(body.enableSmsNotifications) }),
        ...(body.hubtelClientId !== undefined && { hubtelClientId: body.hubtelClientId ? String(body.hubtelClientId).trim() : null }),
        ...(body.hubtelClientSecret !== undefined && { hubtelClientSecret: body.hubtelClientSecret ? String(body.hubtelClientSecret).trim() : null }),
        ...(body.hubtelSenderId !== undefined && { hubtelSenderId: body.hubtelSenderId ? String(body.hubtelSenderId).trim().slice(0, 11) : null }),
        // Feature flags
        ...(body.enablePosTerminal !== undefined && { enablePosTerminal: Boolean(body.enablePosTerminal) }),
        ...(body.enableQuotations !== undefined && { enableQuotations: Boolean(body.enableQuotations) }),
        ...(body.enablePurchaseOrders !== undefined && { enablePurchaseOrders: Boolean(body.enablePurchaseOrders) }),
        ...(body.enableExpiryTracking !== undefined && { enableExpiryTracking: Boolean(body.enableExpiryTracking) }),
        ...(body.enableBranches !== undefined && { enableBranches: Boolean(body.enableBranches) }),
        ...(body.enableCreditSales !== undefined && { enableCreditSales: Boolean(body.enableCreditSales) }),
        ...(body.enableExpenses !== undefined && { enableExpenses: Boolean(body.enableExpenses) }),
        ...(body.enableTill !== undefined && { enableTill: Boolean(body.enableTill) }),
        ...(body.enableBarcodeGenerator !== undefined && { enableBarcodeGenerator: Boolean(body.enableBarcodeGenerator) }),
        // Sales behaviour
        ...(body.allowSaleOnZeroStock !== undefined && { allowSaleOnZeroStock: Boolean(body.allowSaleOnZeroStock) }),
        ...(body.enableAccounting !== undefined && { enableAccounting: Boolean(body.enableAccounting) }),
        ...(body.enablePayroll !== undefined && { enablePayroll: Boolean(body.enablePayroll) }),
      },
    })

    // Seed Chart of Accounts when accounting is first enabled
    if (body.enableAccounting === true) {
      await seedDefaultAccounts(id)
    }

    return NextResponse.json(tenant)
  } catch (err) {
    console.error('Failed to update tenant:', err)
    return NextResponse.json(
      { error: 'Failed to update tenant' },
      { status: 500 }
    )
  }
}
