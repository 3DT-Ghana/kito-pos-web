import { ItemType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import type { BranchAccessContext } from '@/lib/branch/server'
import { applyBranchScope } from '@/lib/branch/server'
import { approvedSaleWhere } from '@/lib/approvals/sales'
import { isLowStock } from '@/lib/items/stock'

export interface DashboardData {
  salesLast7Days: { date: string; revenue: number; label: string }[]
  paymentMethodSplit: { method: string; value: number; color: string }[]
  topItems: { name: string; revenue: number; qty: number }[]
  kpis: {
    todayRevenue: number
    todaySalesCount: number
    monthRevenue: number
    monthSalesCount: number
    monthTrend: number | null
    monthExpenses: number
    totalCustomers: number
    stockValue: number
    outstandingDebt: number
    outstandingDebtCount: number
  }
  recentSales: {
    id: string
    customer: string
    total: number
    paid: number
    items: number
    createdAt: string
  }[]
  lowStockItems: { id: string; name: string; quantity: number }[]
}

export async function getDashboardData(
  context: BranchAccessContext
): Promise<DashboardData> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 86400000 - 1)

  const sevenDaysAgo = new Date(todayStart)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

  const scope = (extra: object) => applyBranchScope({ tenantId: context.tenantId, ...extra }, context)
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
  ] = await Promise.all([
    prisma.sale.findMany({
      where: saleScope({ createdAt: { gte: sevenDaysAgo, lte: todayEnd } }),
      select: { subtotalAmount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.customerPayment.findMany({
      where: scope({ createdAt: { gte: sevenDaysAgo, lte: todayEnd } }),
      select: { amount: true, method: true },
    }),
    prisma.saleItem.findMany({
      where: {
        sale: approvedSaleWhere({
          tenantId: context.tenantId,
          ...(context.branchesEnabled && !context.allBranchesSelected
            ? { branchId: context.currentBranchId } : {}),
          createdAt: { gte: sevenDaysAgo, lte: todayEnd },
        }),
      },
      select: {
        quantity: true,
        price: true,
        discountAmount: true,
        item: { select: { id: true, name: true } },
      },
    }),
    prisma.sale.aggregate({
      where: saleScope({ createdAt: { gte: todayStart, lte: todayEnd } }),
      _sum: { subtotalAmount: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: saleScope({ createdAt: { gte: monthStart } }),
      _sum: { subtotalAmount: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: saleScope({ createdAt: { gte: prevMonthStart, lte: prevMonthEnd } }),
      _sum: { subtotalAmount: true },
    }),
    prisma.purchase.aggregate({
      where: scope({ createdAt: { gte: monthStart } }),
      _sum: { totalAmount: true },
    }),
    prisma.customer.count({ where: { tenantId: context.tenantId } }),
    prisma.item.findMany({
      where: scope({ itemType: ItemType.INVENTORY }),
      select: {
        id: true,
        name: true,
        quantity: true,
        reorderLevel: true,
        costPrice: true,
      },
    }),
    prisma.customer.aggregate({
      where: { tenantId: context.tenantId, balance: { gt: 0 } },
      _sum: { balance: true },
      _count: true,
    }),
    prisma.sale.findMany({
      where: saleScope({}),
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
  ])

  const salesLast7Days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
    const revenue = salesLast7
      .filter((sale) => sale.createdAt.toISOString().split('T')[0] === dateStr)
      .reduce((sum, sale) => sum + sale.subtotalAmount, 0)

    salesLast7Days.push({ date: dateStr, revenue, label })
  }

  const methodMap = allPayments7.reduce<Record<string, number>>((acc, payment) => {
    acc[payment.method] = (acc[payment.method] || 0) + payment.amount
    return acc
  }, {})

  const itemMap = allSaleItems7.reduce<Record<string, { name: string; revenue: number; qty: number }>>((acc, saleItem) => {
    const id = saleItem.item.id
    if (!acc[id]) acc[id] = { name: saleItem.item.name, revenue: 0, qty: 0 }
    acc[id].revenue += Math.max(0, saleItem.price * saleItem.quantity - (saleItem.discountAmount ?? 0))
    acc[id].qty += saleItem.quantity
    return acc
  }, {})

  const topItems = Object.values(itemMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((item) => ({
      name: item.name,
      revenue: Math.round(item.revenue * 100) / 100,
      qty: Math.round(item.qty * 100) / 100,
    }))

  const thisMonthRevenue = monthSales._sum.subtotalAmount ?? 0
  const previousMonthRevenue = prevMonthSales._sum.subtotalAmount ?? 0
  const monthTrend =
    previousMonthRevenue === 0
      ? null
      : Math.round(((thisMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100)
  const stockValue = allItems.reduce((sum, item) => sum + item.quantity * item.costPrice, 0)
  const lowStockItems = allItems
    .filter((item) => isLowStock(item.quantity, item.reorderLevel))
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 6)

  return {
    salesLast7Days,
    paymentMethodSplit: [
      { method: 'Cash', value: methodMap.CASH || 0, color: '#10b981' },
      { method: 'MoMo', value: methodMap.MOMO || 0, color: '#f59e0b' },
      { method: 'Bank', value: methodMap.BANK || 0, color: '#3b82f6' },
    ],
    topItems,
    kpis: {
      todayRevenue: todaySales._sum.subtotalAmount ?? 0,
      todaySalesCount: todaySales._count,
      monthRevenue: thisMonthRevenue,
      monthSalesCount: monthSales._count,
      monthTrend,
      monthExpenses: monthPurchases._sum.totalAmount ?? 0,
      totalCustomers,
      stockValue,
      outstandingDebt: totalDebt._sum.balance ?? 0,
      outstandingDebtCount: totalDebt._count,
    },
    recentSales: recentSales.map((sale) => ({
      id: sale.id,
      customer: sale.customer?.name ?? 'Walk-in',
      total: sale.totalAmount,
      paid: sale.paidAmount,
      items: sale._count.items,
      createdAt: sale.createdAt.toISOString(),
    })),
    lowStockItems,
  }
}
