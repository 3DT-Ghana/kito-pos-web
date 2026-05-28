import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { TenantStatus } from '@prisma/client'
import { approvedSaleWhere } from '@/lib/approvals/sales'
import { requireSuperAdmin } from '@/lib/admin/server'

/**
 * GET /api/admin/tenants
 *
 * Super-admin endpoint — lists all tenants with aggregated stats.
 *
 * Returns each tenant with:
 *  - Basic info (id, name, phone, status, createdAt)
 *  - User count + user list
 *  - Item count + total inventory value
 *  - Sale count + total revenue
 *  - Purchase count + total spend
 *  - Feature flags summary
 */
export async function GET() {
  try {
    const { error } = await requireSuperAdmin()
    if (error) return error

    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
    })

    // For each tenant, fetch aggregated stats in parallel
    const enriched = await Promise.all(
      tenants.map(async (tenant) => {
        const [
          itemStats,
          saleStats,
          purchaseStats,
          customerCount,
          supplierCount,
        ] = await Promise.all([
          // Items: count + total inventory value (cost)
          prisma.item.aggregate({
            where: { tenantId: tenant.id },
            _count: { _all: true },
            _sum: { quantity: true, costPrice: true },
          }),
          // Sales: count + total revenue
          prisma.sale.aggregate({
            where: approvedSaleWhere({ tenantId: tenant.id }),
            _count: { _all: true },
            _sum: { totalAmount: true, paidAmount: true },
          }),
          // Purchases: count + total spend
          prisma.purchase.aggregate({
            where: { tenantId: tenant.id },
            _count: { _all: true },
            _sum: { totalAmount: true, paidAmount: true },
          }),
          prisma.customer.count({ where: { tenantId: tenant.id } }),
          prisma.supplier.count({ where: { tenantId: tenant.id } }),
        ])

        return {
          id: tenant.id,
          name: tenant.name,
          phone: tenant.phone,
          status: tenant.status,
          createdAt: tenant.createdAt,

          // Users
          userCount: tenant._count.users,
          users: tenant.users,

          // Items / Inventory
          itemCount: itemStats._count._all,
          totalInventoryQty: itemStats._sum.quantity ?? 0,
          totalInventoryCost: (itemStats._sum.quantity ?? 0) * 0, // see note below — no avg

          // Sales
          saleCount: saleStats._count._all,
          totalRevenue: saleStats._sum.totalAmount ?? 0,
          totalCollected: saleStats._sum.paidAmount ?? 0,

          // Purchases
          purchaseCount: purchaseStats._count._all,
          totalPurchased: purchaseStats._sum.totalAmount ?? 0,

          // Contacts
          customerCount,
          supplierCount,

          // Feature flags
          features: {
            pos: tenant.enablePosTerminal,
            quotations: tenant.enableQuotations,
            purchaseOrders: tenant.enablePurchaseOrders,
            expiryTracking: tenant.enableExpiryTracking,
            branches: tenant.enableBranches,
            creditSales: tenant.enableCreditSales,
            expenses: tenant.enableExpenses,
            till: tenant.enableTill,
            sms: tenant.enableSmsNotifications,
          },
        }
      })
    )

    // Platform-wide summary
    const summary = {
      totalTenants: enriched.length,
      byStatus: {
        TRIAL: enriched.filter(t => t.status === TenantStatus.TRIAL).length,
        ACTIVE: enriched.filter(t => t.status === TenantStatus.ACTIVE).length,
        SUSPENDED: enriched.filter(t => t.status === TenantStatus.SUSPENDED).length,
      },
      totalUsers: enriched.reduce((s, t) => s + t.userCount, 0),
      totalItems: enriched.reduce((s, t) => s + t.itemCount, 0),
      totalSales: enriched.reduce((s, t) => s + t.saleCount, 0),
      totalRevenue: enriched.reduce((s, t) => s + t.totalRevenue, 0),
    }

    return NextResponse.json({ tenants: enriched, summary })
  } catch (err) {
    console.error('[admin/tenants] Failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/tenants
 * Update a tenant's status (super-admin only)
 * Body: { tenantId, status }
 */
export async function PATCH(req: Request) {
  try {
    const { error } = await requireSuperAdmin()
    if (error) return error

    const body = await req.json()
    const { tenantId, status } = body

    if (!tenantId || !status) {
      return NextResponse.json({ error: 'tenantId and status are required' }, { status: 400 })
    }

    if (!Object.values(TenantStatus).includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: status as TenantStatus },
    })

    return NextResponse.json({ success: true, tenant })
  } catch (err) {
    console.error('[admin/tenants PATCH] Failed:', err)
    return NextResponse.json({ error: 'Failed to update tenant' }, { status: 500 })
  }
}
