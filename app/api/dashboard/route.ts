import { NextResponse } from 'next/server'
import { ItemType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'
import { approvedSaleWhere } from '@/lib/approvals/sales'

export async function GET() {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd   = new Date(todayStart.getTime() + 86400000 - 1)

    const sevenDaysAgo = new Date(todayStart)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    const scope = (extra: object) => applyBranchScope({ tenantId: context!.tenantId, ...extra }, context!)
    const saleScope = (extra: object) => approvedSaleWhere(scope(extra))

    const [
      salesLast7,
      allPayments7,
      allSaleItems7,
      todaySales,
      monthSales,
      prevMonthSales,
      monthPurchases,
      totalCustomers,
      allItems,
      totalDebt,
      recentSales,
      lowStockItems,
    ] = await Promise.all([
      // 7-day daily sales for sparkline
      prisma.sale.findMany({
        where: saleScope({ createdAt: { gte: sevenDaysAgo, lte: todayEnd } }),
        select: { subtotalAmount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      // 7-day payments for method split
      prisma.customerPayment.findMany({
        where: scope({ createdAt: { gte: sevenDaysAgo, lte: todayEnd } }),
        select: { amount: true, method: true },
      }),

      // 7-day sale items for top items
      prisma.saleItem.findMany({
        where: {
          sale: approvedSaleWhere({
            tenantId: context!.tenantId,
            ...(context!.branchesEnabled && !context!.allBranchesSelected
              ? { branchId: context!.currentBranchId } : {}),
            createdAt: { gte: sevenDaysAgo, lte: todayEnd },
          }),
        },
        select: {
          quantity: true,
          price: true,
          discountAmount: true,
          lineSubtotalAmount: true,
          item: { select: { id: true, name: true } },
        },
      }),

      // Today KPI
      prisma.sale.aggregate({
        where: saleScope({ createdAt: { gte: todayStart, lte: todayEnd } }),
        _sum: { subtotalAmount: true },
        _count: true,
      }),

      // This month revenue
      prisma.sale.aggregate({
        where: saleScope({ createdAt: { gte: monthStart } }),
        _sum: { subtotalAmount: true },
        _count: true,
      }),

      // Last month revenue (for trend)
      prisma.sale.aggregate({
        where: saleScope({ createdAt: { gte: prevMonthStart, lte: prevMonthEnd } }),
        _sum: { subtotalAmount: true },
      }),

      // This month purchase spend
      prisma.purchase.aggregate({
        where: scope({ createdAt: { gte: monthStart } }),
        _sum: { totalAmount: true },
      }),

      // Total customers
      prisma.customer.count({ where: { tenantId: context!.tenantId } }),

      // All items (stock value + low stock)
      prisma.item.findMany({
        where: scope({ itemType: ItemType.INVENTORY }),
        select: { id: true, name: true, quantity: true, costPrice: true, sellingPrice: true },
      }),

      // Outstanding customer debt
      prisma.customer.aggregate({
        where: { tenantId: context!.tenantId, balance: { gt: 0 } },
        _sum: { balance: true },
        _count: true,
      }),

      // Recent 5 sales
      prisma.sale.findMany({
        where: saleScope({}),
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          subtotalAmount: true,
          totalAmount: true,
          paidAmount: true,
          createdAt: true,
          customer: { select: { name: true } },
          _count: { select: { items: true } },
        },
      }),

      // Low stock: quantity <= 5
      prisma.item.findMany({
        where: scope({ itemType: ItemType.INVENTORY, quantity: { lte: 5 } }),
        orderBy: { quantity: 'asc' },
        take: 6,
        select: { id: true, name: true, quantity: true },
      }),
    ])

    // 7-day chart
    const salesLast7Days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const label   = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
      const revenue = salesLast7
        .filter(s => s.createdAt.toISOString().split('T')[0] === dateStr)
        .reduce((sum, s) => sum + s.subtotalAmount, 0)
      salesLast7Days.push({ date: dateStr, revenue, label })
    }

    // Payment split
    const methodMap = allPayments7.reduce<Record<string, number>>((acc, p) => {
      acc[p.method] = (acc[p.method] || 0) + p.amount; return acc
    }, {})

    // Top items
    const itemMap = allSaleItems7.reduce<Record<string, { name: string; revenue: number; qty: number }>>((acc, si) => {
      const id = si.item.id
      if (!acc[id]) acc[id] = { name: si.item.name, revenue: 0, qty: 0 }
      acc[id].revenue += si.lineSubtotalAmount ?? Math.max(0, si.price * si.quantity - (si.discountAmount ?? 0))
      acc[id].qty     += si.quantity
      return acc
    }, {})
    const topItems = Object.values(itemMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(i => ({ name: i.name, revenue: Math.round(i.revenue * 100) / 100, qty: Math.round(i.qty * 100) / 100 }))

    // KPIs
    const thisMonthRev  = monthSales._sum.subtotalAmount    ?? 0
    const prevMonthRev  = prevMonthSales._sum.subtotalAmount ?? 0
    const monthTrend    = prevMonthRev === 0 ? null : Math.round(((thisMonthRev - prevMonthRev) / prevMonthRev) * 100)
    const stockValue    = allItems.reduce((sum, i) => sum + i.quantity * i.costPrice, 0)

    return NextResponse.json({
      salesLast7Days,
      paymentMethodSplit: [
        { method: 'Cash', value: methodMap['CASH'] || 0, color: '#10b981' },
        { method: 'MoMo', value: methodMap['MOMO'] || 0, color: '#f59e0b' },
        { method: 'Bank', value: methodMap['BANK'] || 0, color: '#3b82f6' },
      ],
      topItems,
      kpis: {
        todayRevenue:    todaySales._sum.subtotalAmount ?? 0,
        todaySalesCount: todaySales._count,
        monthRevenue:    thisMonthRev,
        monthSalesCount: monthSales._count,
        monthTrend,
        monthExpenses:   monthPurchases._sum.totalAmount ?? 0,
        totalCustomers,
        stockValue,
        outstandingDebt:      totalDebt._sum.balance ?? 0,
        outstandingDebtCount: totalDebt._count,
      },
      recentSales: recentSales.map(s => ({
        id: s.id,
        customer: s.customer?.name ?? 'Walk-in',
        total: s.totalAmount,
        paid:  s.paidAmount,
        items: s._count.items,
        createdAt: s.createdAt.toISOString(),
      })),
      lowStockItems,
    })
  } catch (err) {
    console.error('Dashboard API error:', err)
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })
  }
}
