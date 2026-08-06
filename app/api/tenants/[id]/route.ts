import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requireOwner } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { TenantStatus } from '@prisma/client'
import { seedDefaultAccounts } from '@/lib/accounting/seedAccounts'
import { backfillNullBranchRows } from '@/lib/branch/backfill'

/**
 * Tenant Management API
 *
 * GET /api/tenants/[id] - Get tenant details
 * PUT /api/tenants/[id] - Update tenant information
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

const TENANT_PUBLIC_SUMMARY_SELECT = {
  id: true,
  name: true,
  useUnitSystem: true,
  enableRetailPrice: true,
  enableWholesalePrice: true,
  enablePromoPrice: true,
  enableDiscounts: true,
  enableSmsNotifications: true,
  enableWhatsApp: true,
  metaWabaToken: true,
  metaWabaPhoneNumberId: true,
  enablePosTerminal: true,
  enableQuotations: true,
  enablePurchaseOrders: true,
  enableExpiryTracking: true,
  enableBranches: true,
  enableCreditSales: true,
  enableExpenses: true,
  enableTill: true,
  enableMomoCollect: true,
  allowSaleOnZeroStock: true,
  enableBarcodeGenerator: true,
  enableAccounting: true,
  enablePayroll: true,
  requireApproval: true,
} as const

/**
 * GET /api/tenants/[id]
 * Get the safe tenant summary used by tenant-facing clients.
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
      select: TENANT_PUBLIC_SUMMARY_SELECT,
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

    // Captured before the update so the branches OFF -> ON transition can be
    // detected; a plain `body.enableBranches === true` would re-run the
    // backfill on every unrelated settings save.
    const previous = await prisma.tenant.findUnique({
      where: { id },
      select: { enableBranches: true },
    })
    const enablingBranches = body.enableBranches === true && previous?.enableBranches === false

    // Update tenant
    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.phone !== undefined && { phone: body.phone ? body.phone.trim() : null }),
        ...(body.status && { status: body.status as TenantStatus }),
        ...(body.showManufacturerOnReceipt !== undefined && { showManufacturerOnReceipt: body.showManufacturerOnReceipt }),
        ...(body.receiptPrinterWidth !== undefined && { receiptPrinterWidth: body.receiptPrinterWidth }),
        ...(body.receiptPrinterName !== undefined && { receiptPrinterName: body.receiptPrinterName || null }),
        ...(body.reportPrinterName !== undefined && { reportPrinterName: body.reportPrinterName || null }),
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
        ...(body.hubtelCollectionAccount !== undefined && { hubtelCollectionAccount: body.hubtelCollectionAccount ? String(body.hubtelCollectionAccount).trim() : null }),
        ...(body.hubtelCallbackUrl !== undefined && { hubtelCallbackUrl: body.hubtelCallbackUrl ? String(body.hubtelCallbackUrl).trim() : null }),
        // WhatsApp settings
        ...(body.enableWhatsApp !== undefined && { enableWhatsApp: Boolean(body.enableWhatsApp) }),
        ...(body.metaWabaToken !== undefined && { metaWabaToken: body.metaWabaToken ? String(body.metaWabaToken).trim() : null }),
        ...(body.metaWabaPhoneNumberId !== undefined && { metaWabaPhoneNumberId: body.metaWabaPhoneNumberId ? String(body.metaWabaPhoneNumberId).trim() : null }),
        // Feature flags
        ...(body.enablePosTerminal !== undefined && { enablePosTerminal: Boolean(body.enablePosTerminal) }),
        ...(body.enableQuotations !== undefined && { enableQuotations: Boolean(body.enableQuotations) }),
        ...(body.enablePurchaseOrders !== undefined && { enablePurchaseOrders: Boolean(body.enablePurchaseOrders) }),
        ...(body.enableExpiryTracking !== undefined && { enableExpiryTracking: Boolean(body.enableExpiryTracking) }),
        ...(body.enableBranches !== undefined && { enableBranches: Boolean(body.enableBranches) }),
        ...(body.enableCreditSales !== undefined && { enableCreditSales: Boolean(body.enableCreditSales) }),
        ...(body.enableExpenses !== undefined && { enableExpenses: Boolean(body.enableExpenses) }),
        ...(body.enableTill !== undefined && { enableTill: Boolean(body.enableTill) }),
        ...(body.enableMomoCollect !== undefined && { enableMomoCollect: Boolean(body.enableMomoCollect) }),
        ...(body.enableBarcodeGenerator !== undefined && { enableBarcodeGenerator: Boolean(body.enableBarcodeGenerator) }),
        // Sales behaviour
        ...(body.allowSaleOnZeroStock !== undefined && { allowSaleOnZeroStock: Boolean(body.allowSaleOnZeroStock) }),
        ...(body.enableAccounting !== undefined && { enableAccounting: Boolean(body.enableAccounting) }),
        ...(body.enablePayroll !== undefined && { enablePayroll: Boolean(body.enablePayroll) }),
        ...(body.requireApproval !== undefined && { requireApproval: Boolean(body.requireApproval) }),
      },
    })

    // Seed Chart of Accounts when accounting is first enabled
    if (body.enableAccounting === true) {
      await seedDefaultAccounts(id)
    }

    // Branch scoping is strict equality, so every row written while branches
    // were off (branchId: null) would vanish from every list and report the
    // moment the flag flips — and only OWNER/STORE_MANAGER could ever see it
    // again via "All Branches". Tag that history to the default branch instead.
    let branchBackfill: Awaited<ReturnType<typeof backfillNullBranchRows>> | null = null
    if (enablingBranches) {
      branchBackfill = await backfillNullBranchRows(id)
    }

    return NextResponse.json({ ...tenant, ...(branchBackfill ? { branchBackfill } : {}) })
  } catch (err) {
    console.error('Failed to update tenant:', err)
    return NextResponse.json(
      { error: 'Failed to update tenant' },
      { status: 500 }
    )
  }
}
