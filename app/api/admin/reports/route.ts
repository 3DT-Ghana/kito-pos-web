import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import { approvedSaleWhere } from '@/lib/approvals/sales'

/**
 * GET /api/admin/reports
 *
 * Returns agent performance and shop revenue report data for the super admin.
 *
 * Agent performance per agent:
 *  - total applications submitted, approved, rejected, pending
 *  - total shops onboarded (approved applications)
 *  - total revenue generated across their onboarded shops
 *  - estimated commission (2% of revenue from onboarded shops)
 *
 * Shop revenue summary per tenant:
 *  - revenue, collections, purchases, estimated profit
 *  - which agent onboarded them
 */
export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error

  // ── 1. All agents with their applications ───────────────────────────────
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      agentCode: true,
      fullName: true,
      email: true,
      territory: true,
      status: true,
      approvedAt: true,
      createdAt: true,
      onboardedBusinesses: {
        select: {
          id: true,
          businessName: true,
          status: true,
          tenantId: true,
          createdAt: true,
        },
      },
    },
  })

  // ── 2. All tenants with their agent link + sales/purchase aggregates ────
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      createdAt: true,
      agentId: true,
    },
  })

  // Aggregate sales + purchases for every tenant in one pass
  const tenantIds = tenants.map(t => t.id)

  const [salesAgg, purchaseAgg] = await Promise.all([
    prisma.sale.groupBy({
      by: ['tenantId'],
      where: {
        ...approvedSaleWhere({}),
        tenantId: { in: tenantIds },
      },
      _sum: { totalAmount: true, paidAmount: true },
      _count: { _all: true },
    }),
    prisma.purchase.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: tenantIds } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
  ])

  const salesByTenant = Object.fromEntries(
    salesAgg.map(s => [s.tenantId, s])
  )
  const purchaseByTenant = Object.fromEntries(
    purchaseAgg.map(p => [p.tenantId, p])
  )

  // ── 3. Build shop report rows ────────────────────────────────────────────
  // Map agentId → agent name for enriching shop rows
  const agentMap = Object.fromEntries(
    agents.map(a => [a.id, { fullName: a.fullName, agentCode: a.agentCode }])
  )

  const shopReport = tenants.map(t => {
    const sales = salesByTenant[t.id]
    const purchases = purchaseByTenant[t.id]
    const revenue = sales?._sum.totalAmount ?? 0
    const collected = sales?._sum.paidAmount ?? 0
    const purchased = purchases?._sum.totalAmount ?? 0
    const profit = collected - purchased
    const agent = t.agentId ? agentMap[t.agentId] : null

    return {
      id: t.id,
      name: t.name,
      phone: t.phone,
      status: t.status,
      createdAt: t.createdAt,
      agentId: t.agentId,
      agentName: agent?.fullName ?? null,
      agentCode: agent?.agentCode ?? null,
      saleCount: sales?._count._all ?? 0,
      revenue,
      collected,
      purchaseCount: purchases?._count._all ?? 0,
      purchased,
      profit,
    }
  })

  // ── 4. Build agent performance rows ─────────────────────────────────────
  // For each agent, sum revenue from tenants they onboarded
  const tenantRevenueById = Object.fromEntries(
    shopReport.map(s => [s.id, s.revenue])
  )

  const COMMISSION_RATE = 0.02 // 2% of revenue from onboarded shops

  const agentReport = agents.map(agent => {
    const apps = agent.onboardedBusinesses
    const approvedApps = apps.filter(a => a.status === 'APPROVED')
    const pendingApps = apps.filter(a => a.status === 'PENDING')
    const rejectedApps = apps.filter(a => a.status === 'REJECTED')

    const onboardedRevenue = approvedApps.reduce(
      (sum, app) => sum + (app.tenantId ? (tenantRevenueById[app.tenantId] ?? 0) : 0),
      0
    )
    const estimatedCommission = onboardedRevenue * COMMISSION_RATE

    return {
      id: agent.id,
      agentCode: agent.agentCode,
      fullName: agent.fullName,
      email: agent.email,
      territory: agent.territory,
      status: agent.status,
      approvedAt: agent.approvedAt,
      createdAt: agent.createdAt,
      totalApplications: apps.length,
      approvedApplications: approvedApps.length,
      pendingApplications: pendingApps.length,
      rejectedApplications: rejectedApps.length,
      onboardedRevenue,
      estimatedCommission,
    }
  })

  // ── 5. Platform totals ───────────────────────────────────────────────────
  const totals = {
    totalRevenue: shopReport.reduce((s, t) => s + t.revenue, 0),
    totalCollected: shopReport.reduce((s, t) => s + t.collected, 0),
    totalPurchased: shopReport.reduce((s, t) => s + t.purchased, 0),
    totalProfit: shopReport.reduce((s, t) => s + t.profit, 0),
    totalCommissions: agentReport.reduce((s, a) => s + a.estimatedCommission, 0),
    totalOnboardedShops: shopReport.filter(s => s.agentId).length,
    selfSignupShops: shopReport.filter(s => !s.agentId).length,
  }

  return NextResponse.json({ agentReport, shopReport, totals })
}
