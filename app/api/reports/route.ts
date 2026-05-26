import { NextResponse } from 'next/server'
import { ItemType, TaxTransactionType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { hasPermission, requirePermission } from '@/lib/permissions/rbac'
import {
  applyBranchScope,
  isBranchFilterActive,
  requireBranchAccess,
  type BranchAccessContext,
} from '@/lib/branch/server'
import { approvedSaleWhere } from '@/lib/approvals/sales'
import {
  getScopedCustomerMetrics,
  getScopedSupplierMetrics,
} from '@/lib/branch/scopedMetrics'
import {
  roundTaxAmount,
  summariseTaxBreakdown,
} from '@/lib/tax/summary'

/**
 * Comprehensive Reports API
 *
 * GET /api/reports?type={type}&startDate={date}&endDate={date}
 *
 * Report Types:
 * - sales: Sales summary by date range
 * - purchases: Purchase summary by date range
 * - inventory: Current stock levels
 * - debtors: Customer balances (accounts receivable)
 * - creditors: Supplier balances (accounts payable)
 * - profit: Profit/loss calculations
 * - dashboard: Combined summary for dashboard
 * - end-of-day: Comprehensive daily summary
 */

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'dashboard'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const reportFilters = {
      taxRateId: searchParams.get('taxRateId') || searchParams.get('taxType') || undefined,
      productId: searchParams.get('productId') || searchParams.get('product') || undefined,
      customerId: searchParams.get('customerId') || searchParams.get('customer') || undefined,
    }
    const requiredPermission = type === 'profit' ? 'view_profit_margins' : 'view_basic_reports'
    const { authorized, error: permError } = requirePermission(context!, requiredPermission)
    if (!authorized) return permError!
    const canViewProfitMargins = hasPermission(context!, 'view_profit_margins')

    // Build date filter
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) dateFilter.lte = new Date(endDate)

    switch (type) {
      case 'sales':
        return await salesReport(context!, dateFilter)
      case 'purchases':
        return await purchasesReport(context!, dateFilter)
      case 'inventory':
        return await inventoryReport(context!, canViewProfitMargins)
      case 'debtors':
        return await debtorsReport(context!)
      case 'creditors':
        return await creditorsReport(context!)
      case 'profit':
        return await profitReport(context!, dateFilter)
      case 'dashboard':
        return await dashboardReport(context!, canViewProfitMargins)
      case 'end-of-day':
        return await endOfDayReport(context!, dateFilter, canViewProfitMargins)
      case 'tax-summary':
        return await taxSummaryReport(context!, dateFilter, reportFilters)
      case 'tax-collected':
        return await taxCollectedReport(context!, dateFilter, reportFilters)
      case 'tax-by-invoice':
        return await taxByInvoiceReport(context!, dateFilter, reportFilters)
      case 'tax-by-product':
        return await taxByProductReport(context!, dateFilter, reportFilters)
      case 'tax-liability':
        return await taxLiabilityReport(context!, dateFilter, reportFilters)
      default:
        return NextResponse.json(
          { error: 'Invalid report type' },
          { status: 400 }
        )
    }
  } catch (err) {
    console.error('Failed to generate report:', err)
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    )
  }
}

interface InventoryReportItem {
  id: string
  name: string
  quantity: number
  sellingPrice: number
  manufacturer: {
    id: string
    name: string
  } | null
  costPrice?: number
}

async function withVisibleCustomerBalances<T extends { id: string; balance: number }>(
  context: BranchAccessContext,
  customers: T[]
) {
  if (!isBranchFilterActive(context) || customers.length === 0) {
    return customers
  }

  const metrics = await getScopedCustomerMetrics(
    context,
    customers.map((customer) => customer.id)
  )

  return customers
    .map((customer) => ({
      ...customer,
      balance: metrics.get(customer.id)?.balance ?? 0,
    }))
    .filter((customer) => customer.balance > 0)
}

async function withVisibleSupplierBalances<T extends { id: string; balance: number }>(
  context: BranchAccessContext,
  suppliers: T[]
) {
  if (!isBranchFilterActive(context) || suppliers.length === 0) {
    return suppliers
  }

  const metrics = await getScopedSupplierMetrics(
    context,
    suppliers.map((supplier) => supplier.id)
  )

  return suppliers
    .map((supplier) => ({
      ...supplier,
      balance: metrics.get(supplier.id)?.balance ?? 0,
    }))
    .filter((supplier) => supplier.balance > 0)
}

/**
 * Sales Report
 */
async function salesReport(context: BranchAccessContext, dateFilter: { gte?: Date; lte?: Date }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = approvedSaleWhere(
    applyBranchScope({ tenantId: context.tenantId }, context)
  )
  if (Object.keys(dateFilter).length > 0) {
    where.createdAt = dateFilter
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      items: { include: { item: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalSales = sales.reduce((sum, s) => sum + s.totalAmount, 0)
  const subtotalSales = sales.reduce(
    (sum, s) => sum + (s.subtotalAmount ?? s.totalAmount),
    0
  )
  const totalTax = sales.reduce((sum, s) => sum + (s.taxAmount ?? 0), 0)
  const totalPaid = sales.reduce((sum, s) => sum + s.paidAmount, 0)
  const totalCredit = totalSales - totalPaid
  const cashSales = sales.filter(s => s.paymentType === 'CASH').length
  const creditSales = sales.filter(s => s.paymentType === 'CREDIT').length

  return NextResponse.json({
    type: 'sales',
    period: { start: dateFilter.gte, end: dateFilter.lte },
    summary: {
      totalTransactions: sales.length,
      totalSales,
      subtotalSales,
      totalTax,
      totalPaid,
      totalCredit,
      cashSales,
      creditSales,
      averageTransaction: sales.length > 0 ? totalSales / sales.length : 0,
    },
    sales,
  })
}

/**
 * Purchases Report
 */
async function purchasesReport(context: BranchAccessContext, dateFilter: { gte?: Date; lte?: Date }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = applyBranchScope({ tenantId: context.tenantId }, context)
  if (Object.keys(dateFilter).length > 0) {
    where.createdAt = dateFilter
  }

  const purchases = await prisma.purchase.findMany({
    where,
    include: {
      supplier: { select: { name: true } },
      items: { include: { item: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalPurchases = purchases.reduce((sum, p) => sum + p.totalAmount, 0)
  const totalPaid = purchases.reduce((sum, p) => sum + p.paidAmount, 0)
  const totalCredit = totalPurchases - totalPaid

  return NextResponse.json({
    type: 'purchases',
    period: { start: dateFilter.gte, end: dateFilter.lte },
    summary: {
      totalTransactions: purchases.length,
      totalPurchases,
      totalPaid,
      totalCredit,
      averageTransaction: purchases.length > 0 ? totalPurchases / purchases.length : 0,
    },
    purchases,
  })
}

/**
 * Inventory Report
 */
async function inventoryReport(
  context: BranchAccessContext,
  canViewProfitMargins: boolean
) {
  const items = await prisma.item.findMany({
    where: applyBranchScope({ tenantId: context.tenantId, itemType: ItemType.INVENTORY }, context),
    select: {
      id: true,
      name: true,
      quantity: true,
      costPrice: true,
      sellingPrice: true,
      manufacturer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0)
  const potentialRevenue = items.reduce((sum, item) => sum + (item.quantity * item.sellingPrice), 0)
  const visibleItems: InventoryReportItem[] = canViewProfitMargins
    ? items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        manufacturer: item.manufacturer
          ? { id: item.manufacturer.id, name: item.manufacturer.name }
          : null,
      }))
    : items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        manufacturer: item.manufacturer
          ? { id: item.manufacturer.id, name: item.manufacturer.name }
          : null,
      }))
  const lowStockItems = visibleItems.filter(item => item.quantity <= 10)
  const outOfStockItems = visibleItems.filter(item => item.quantity === 0)

  return NextResponse.json({
    type: 'inventory',
    summary: canViewProfitMargins
      ? {
          totalItems: visibleItems.length,
          totalStockValue: totalValue,
          potentialRevenue,
          potentialProfit: potentialRevenue - totalValue,
          lowStockCount: lowStockItems.length,
          outOfStockCount: outOfStockItems.length,
        }
      : {
          totalItems: visibleItems.length,
          potentialRevenue,
          lowStockCount: lowStockItems.length,
          outOfStockCount: outOfStockItems.length,
        },
    items: visibleItems,
    lowStockItems,
    outOfStockItems,
    meta: {
      canViewProfitMargins,
    },
  })
}

/**
 * Debtors Report (Customers with Outstanding Balances)
 */
async function debtorsReport(context: BranchAccessContext) {
  const customers = await prisma.customer.findMany({
    where: {
      tenantId: context.tenantId,
      ...(isBranchFilterActive(context) ? {} : { balance: { gt: 0 } }),
    },
    include: {
      _count: { select: { sales: true } },
    },
    orderBy: { balance: 'desc' },
  })
  const visibleCustomers = await withVisibleCustomerBalances(context, customers)

  const totalDebt = visibleCustomers.reduce((sum, customer) => sum + customer.balance, 0)

  return NextResponse.json({
    type: 'debtors',
    summary: {
      totalDebtors: visibleCustomers.length,
      totalDebt,
      averageDebt: visibleCustomers.length > 0 ? totalDebt / visibleCustomers.length : 0,
    },
    debtors: visibleCustomers,
  })
}

/**
 * Creditors Report (Suppliers with Outstanding Balances)
 */
async function creditorsReport(context: BranchAccessContext) {
  const suppliers = await prisma.supplier.findMany({
    where: {
      tenantId: context.tenantId,
      ...(isBranchFilterActive(context) ? {} : { balance: { gt: 0 } }),
    },
    include: {
      _count: { select: { purchases: true } },
    },
    orderBy: { balance: 'desc' },
  })
  const visibleSuppliers = await withVisibleSupplierBalances(context, suppliers)

  const totalCredit = visibleSuppliers.reduce((sum, supplier) => sum + supplier.balance, 0)

  return NextResponse.json({
    type: 'creditors',
    summary: {
      totalCreditors: visibleSuppliers.length,
      totalCredit,
      averageCredit: visibleSuppliers.length > 0 ? totalCredit / visibleSuppliers.length : 0,
    },
    creditors: visibleSuppliers,
  })
}

/**
 * Profit/Loss Report
 */
async function profitReport(context: BranchAccessContext, dateFilter: { gte?: Date; lte?: Date }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = approvedSaleWhere(
    applyBranchScope({ tenantId: context.tenantId }, context)
  )
  if (Object.keys(dateFilter).length > 0) {
    where.createdAt = dateFilter
  }

  // Get sales with items
  const sales = await prisma.sale.findMany({
    where,
    include: {
      items: {
        include: {
          item: { select: { costPrice: true, itemType: true } },
        },
      },
    },
  })

  // Calculate revenue and cost
  let totalRevenue = 0
  let totalCost = 0

  for (const sale of sales) {
    totalRevenue += sale.subtotalAmount ?? sale.totalAmount
    for (const saleItem of sale.items) {
      if (saleItem.item.itemType === 'INVENTORY') {
        totalCost += saleItem.item.costPrice * saleItem.quantity
      }
    }
  }

  const grossProfit = totalRevenue - totalCost
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  return NextResponse.json({
    type: 'profit',
    period: { start: dateFilter.gte, end: dateFilter.lte },
    summary: {
      totalRevenue,
      totalCost,
      grossProfit,
      profitMargin: profitMargin.toFixed(2) + '%',
      totalTransactions: sales.length,
      averageProfit: sales.length > 0 ? grossProfit / sales.length : 0,
    },
  })
}

/**
 * Dashboard Report (Combined Summary)
 */
async function dashboardReport(
  context: BranchAccessContext,
  canViewProfitMargins: boolean
) {
  // Get counts and totals in parallel
  const [
    totalItems,
    totalCustomers,
    totalSuppliers,
    totalSales,
    totalPurchases,
    lowStockItems,
    customers,
    suppliers,
  ] = await Promise.all([
    prisma.item.count({ where: applyBranchScope({ tenantId: context.tenantId }, context) }),
    prisma.customer.count({ where: { tenantId: context.tenantId } }),
    prisma.supplier.count({ where: { tenantId: context.tenantId } }),
    prisma.sale.findMany({ where: approvedSaleWhere(applyBranchScope({ tenantId: context.tenantId }, context)) }),
    prisma.purchase.findMany({ where: applyBranchScope({ tenantId: context.tenantId }, context) }),
    prisma.item.findMany({ where: applyBranchScope({ tenantId: context.tenantId, itemType: ItemType.INVENTORY, quantity: { lte: 10 } }, context) }),
    prisma.customer.findMany({
      where: {
        tenantId: context.tenantId,
        ...(isBranchFilterActive(context) ? {} : { balance: { gt: 0 } }),
      },
      select: { id: true, balance: true },
    }),
    prisma.supplier.findMany({
      where: {
        tenantId: context.tenantId,
        ...(isBranchFilterActive(context) ? {} : { balance: { gt: 0 } }),
      },
      select: { id: true, balance: true },
    }),
  ])

  const [customersWithDebt, suppliersWithCredit] = await Promise.all([
    withVisibleCustomerBalances(context, customers),
    withVisibleSupplierBalances(context, suppliers),
  ])

  const totalRevenue = totalSales.reduce(
    (sum, s) => sum + (s.subtotalAmount ?? s.totalAmount),
    0
  )
  const totalCost = totalPurchases.reduce((sum, p) => sum + p.totalAmount, 0)
  const totalDebt = customersWithDebt.reduce((sum, c) => sum + c.balance, 0)
  const totalCredit = suppliersWithCredit.reduce((sum, s) => sum + s.balance, 0)

  return NextResponse.json({
    type: 'dashboard',
    summary: {
      inventory: {
        totalItems,
        lowStockCount: lowStockItems.length,
      },
      contacts: {
        totalCustomers,
        customersWithDebt: customersWithDebt.length,
        totalSuppliers,
        suppliersWithCredit: suppliersWithCredit.length,
      },
      financial: {
        totalSales: totalSales.length,
        totalRevenue,
        totalPurchases: totalPurchases.length,
        ...(canViewProfitMargins ? { totalCost } : {}),
        totalDebt,
        totalCredit,
        netPosition: totalDebt - totalCredit,
      },
      alerts: {
        lowStockItems: lowStockItems.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
        })),
      },
    },
  })
}

/**
 * End of Day Report (Comprehensive Daily Summary)
 */
async function endOfDayReport(
  context: BranchAccessContext,
  dateFilter: { gte?: Date; lte?: Date },
  canViewProfitMargins: boolean
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dayWhere: any = applyBranchScope({ tenantId: context.tenantId }, context)
  if (Object.keys(dateFilter).length > 0) {
    dayWhere.createdAt = dateFilter
  }

  const [
    sales,
    purchases,
    customerPayments,
    supplierPayments,
    stockAdjustmentCount,
    lowStockItems,
    outOfStockItems,
    customers,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: approvedSaleWhere(dayWhere),
      include: {
        customer: { select: { name: true } },
        items: {
          include: {
            item: { select: { name: true, costPrice: true, itemType: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.purchase.findMany({
      where: dayWhere,
      include: {
        supplier: { select: { name: true } },
        items: {
          include: {
            item: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customerPayment.findMany({ where: dayWhere }),
    prisma.supplierPayment.findMany({ where: dayWhere }),
    prisma.stockAdjustment.count({ where: dayWhere }),
    prisma.item.findMany({
      where: applyBranchScope({ tenantId: context.tenantId, itemType: ItemType.INVENTORY, quantity: { gt: 0, lte: 10 } }, context),
      select: { id: true, name: true, quantity: true },
      orderBy: { quantity: 'asc' },
    }),
    prisma.item.findMany({
      where: applyBranchScope({ tenantId: context.tenantId, itemType: ItemType.INVENTORY, quantity: { equals: 0 } }, context),
      select: { id: true, name: true, quantity: true },
    }),
    prisma.customer.findMany({
      where: {
        tenantId: context.tenantId,
        ...(isBranchFilterActive(context) ? {} : { balance: { gt: 0 } }),
      },
      select: { id: true, name: true, phone: true, balance: true },
    }),
  ])
  const visibleDebtors = await withVisibleCustomerBalances(context, customers)
  const topDebtors = [...visibleDebtors]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5)
  const totalOutstandingDebt = visibleDebtors.reduce(
    (sum, customer) => sum + customer.balance,
    0
  )

  // Sales Summary
  const totalRevenue = sales.reduce(
    (sum, s) => sum + (s.subtotalAmount ?? s.totalAmount),
    0
  )
  const totalTaxCollected = sales.reduce((sum, s) => sum + (s.taxAmount ?? 0), 0)
  const cashSales = sales.filter(s => s.paymentType === 'CASH')
  const creditSales = sales.filter(s => s.paymentType === 'CREDIT')

  // Top 5 selling items
  const itemSalesMap: Record<string, { name: string; quantity: number; revenue: number }> = {}
  for (const sale of sales) {
    for (const si of sale.items) {
      const key = si.itemId
      if (!itemSalesMap[key]) {
        itemSalesMap[key] = { name: si.item.name, quantity: 0, revenue: 0 }
      }
      itemSalesMap[key].quantity += si.quantity
      itemSalesMap[key].revenue += si.lineSubtotalAmount ?? Math.max(0, si.price * si.quantity - (si.discountAmount ?? 0))
    }
  }
  const topSellingItems = Object.values(itemSalesMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)

  // Cash & Payments
  const cashPayments = customerPayments.filter(p => p.method === 'CASH').reduce((s, p) => s + p.amount, 0)
  const momoPayments = customerPayments.filter(p => p.method === 'MOMO').reduce((s, p) => s + p.amount, 0)
  const bankPayments = customerPayments.filter(p => p.method === 'BANK').reduce((s, p) => s + p.amount, 0)
  const totalCustomerPayments = customerPayments.reduce((s, p) => s + p.amount, 0)
  const newCreditIssued = creditSales.reduce((s, sale) => s + (sale.totalAmount - sale.paidAmount), 0)

  // Purchases
  const totalPurchaseAmount = purchases.reduce((sum, p) => sum + p.totalAmount, 0)
  const cashPurchases = purchases.filter(p => p.paymentType === 'CASH')
  const creditPurchases = purchases.filter(p => p.paymentType === 'CREDIT')
  const restockedItems: { name: string; quantity: number }[] = []
  for (const purchase of purchases) {
    for (const pi of purchase.items) {
      restockedItems.push({ name: pi.item.name, quantity: pi.quantity })
    }
  }
  const totalSupplierPayments = supplierPayments.reduce((s, p) => s + p.amount, 0)

  // Profit
  let totalCOGS = 0
  for (const sale of sales) {
    for (const si of sale.items) {
      if (si.item.itemType === 'INVENTORY') {
        totalCOGS += si.item.costPrice * si.quantity
      }
    }
  }
  const grossProfit = totalRevenue - totalCOGS
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // Build response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any = {
    type: 'end-of-day',
    date: dateFilter.gte || null,

    salesSummary: {
      totalCount: sales.length,
      totalRevenue,
      totalTaxCollected,
      cashSalesCount: cashSales.length,
      cashSalesAmount: cashSales.reduce((s, sale) => s + sale.totalAmount, 0),
      creditSalesCount: creditSales.length,
      creditSalesAmount: creditSales.reduce((s, sale) => s + sale.totalAmount, 0),
      averageSaleValue: sales.length > 0 ? totalRevenue / sales.length : 0,
      topSellingItems,
    },

    cashAndPayments: {
      cashSalesReceived: cashSales.reduce((s, sale) => s + sale.paidAmount, 0),
      customerPaymentsByMethod: { CASH: cashPayments, MOMO: momoPayments, BANK: bankPayments },
      totalCustomerPayments,
      newCreditIssued,
    },

    purchasesSummary: {
      totalCount: purchases.length,
      totalAmount: totalPurchaseAmount,
      cashPurchasesCount: cashPurchases.length,
      cashPurchasesAmount: cashPurchases.reduce((s, p) => s + p.totalAmount, 0),
      creditPurchasesCount: creditPurchases.length,
      creditPurchasesAmount: creditPurchases.reduce((s, p) => s + p.totalAmount, 0),
      restockedItems,
      totalSupplierPayments,
    },

    inventoryAlerts: {
      lowStockItems,
      lowStockCount: lowStockItems.length,
      outOfStockItems,
      outOfStockCount: outOfStockItems.length,
      stockAdjustmentsCount: stockAdjustmentCount,
    },

    creditAndDebt: {
      totalOutstandingDebt,
      totalDebtorsCount: visibleDebtors.length,
      newDebtToday: newCreditIssued,
      debtCollectedToday: totalCustomerPayments,
      topDebtors,
    },
  }

  // Only include profit if user has permission
  if (canViewProfitMargins) {
    response.profitSummary = {
      totalRevenue,
      totalCOGS,
      grossProfit,
      profitMargin: Number(profitMargin.toFixed(2)),
    }
  }

  return NextResponse.json(response)
}

interface TaxReportFilters {
  taxRateId?: string
  productId?: string
  customerId?: string
}

function hasDateFilter(dateFilter: { gte?: Date; lte?: Date }) {
  return Object.keys(dateFilter).length > 0
}

function buildTaxLineWhere(
  context: BranchAccessContext,
  dateFilter: { gte?: Date; lte?: Date },
  filters: TaxReportFilters
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const andClauses: any[] = [
    {
      OR: [
        {
          transactionType: TaxTransactionType.SALE,
          sale: approvedSaleWhere(),
        },
        {
          transactionType: TaxTransactionType.CUSTOMER_RETURN,
          customerReturn: {
            sale: approvedSaleWhere(),
          },
        },
      ],
    },
  ]

  if (filters.taxRateId) {
    andClauses.push({ taxRateId: filters.taxRateId })
  }

  if (filters.productId) {
    andClauses.push({
      OR: [
        { saleItem: { itemId: filters.productId } },
        { customerReturn: { itemId: filters.productId } },
      ],
    })
  }

  if (filters.customerId) {
    andClauses.push({
      OR: [
        { sale: { customerId: filters.customerId } },
        { customerReturn: { sale: { customerId: filters.customerId } } },
      ],
    })
  }

  if (isBranchFilterActive(context) && context.currentBranchId) {
    andClauses.push({
      OR: [
        { sale: { branchId: context.currentBranchId } },
        { customerReturn: { sale: { branchId: context.currentBranchId } } },
      ],
    })
  }

  return {
    tenantId: context.tenantId,
    transactionType: {
      in: [TaxTransactionType.SALE, TaxTransactionType.CUSTOMER_RETURN],
    },
    ...(hasDateFilter(dateFilter) ? { createdAt: dateFilter } : {}),
    AND: andClauses,
  }
}

function isReturnTaxLine(line: {
  transactionType: TaxTransactionType
  taxAmount: number
}) {
  return (
    line.transactionType === TaxTransactionType.CUSTOMER_RETURN ||
    line.taxAmount < 0
  )
}

async function taxSummaryReport(
  context: BranchAccessContext,
  dateFilter: { gte?: Date; lte?: Date },
  filters: TaxReportFilters
) {
  const taxLines = await prisma.transactionTaxLine.findMany({
    where: buildTaxLineWhere(context, dateFilter, filters),
    orderBy: [{ taxName: 'asc' }, { createdAt: 'desc' }],
  })

  const grouped = new Map<
    string,
    {
      taxRateId: string | null
      taxName: string
      taxRatePercentage: number
      salesTaxableAmount: number
      salesTaxAmount: number
      returnTaxableAmount: number
      returnTaxAmount: number
      transactionCount: number
    }
  >()

  for (const line of taxLines) {
    const key = `${line.taxRateId ?? line.taxName}:${line.taxName}:${line.taxRatePercentage}`
    const existing = grouped.get(key) ?? {
      taxRateId: line.taxRateId ?? null,
      taxName: line.taxName,
      taxRatePercentage: roundTaxAmount(line.taxRatePercentage),
      salesTaxableAmount: 0,
      salesTaxAmount: 0,
      returnTaxableAmount: 0,
      returnTaxAmount: 0,
      transactionCount: 0,
    }

    const taxableAmount = Math.abs(line.taxableAmount)
    const taxAmount = Math.abs(line.taxAmount)
    if (isReturnTaxLine(line)) {
      existing.returnTaxableAmount = roundTaxAmount(
        existing.returnTaxableAmount + taxableAmount
      )
      existing.returnTaxAmount = roundTaxAmount(
        existing.returnTaxAmount + taxAmount
      )
    } else {
      existing.salesTaxableAmount = roundTaxAmount(
        existing.salesTaxableAmount + taxableAmount
      )
      existing.salesTaxAmount = roundTaxAmount(existing.salesTaxAmount + taxAmount)
    }

    existing.transactionCount += 1
    grouped.set(key, existing)
  }

  const rows = Array.from(grouped.values())
    .map((row) => ({
      ...row,
      netTaxableAmount: roundTaxAmount(
        row.salesTaxableAmount - row.returnTaxableAmount
      ),
      netTaxAmount: roundTaxAmount(row.salesTaxAmount - row.returnTaxAmount),
    }))
    .sort((a, b) => {
      if (b.netTaxAmount !== a.netTaxAmount) {
        return b.netTaxAmount - a.netTaxAmount
      }

      return a.taxName.localeCompare(b.taxName)
    })

  return NextResponse.json({
    type: 'tax-summary',
    period: { start: dateFilter.gte, end: dateFilter.lte },
    summary: {
      taxTypes: rows.length,
      totalCollectedTax: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.salesTaxAmount, 0)
      ),
      totalReturnedTax: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.returnTaxAmount, 0)
      ),
      netTax: roundTaxAmount(rows.reduce((sum, row) => sum + row.netTaxAmount, 0)),
      totalTaxableSales: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.salesTaxableAmount, 0)
      ),
      totalTaxableReturns: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.returnTaxableAmount, 0)
      ),
      netTaxableAmount: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.netTaxableAmount, 0)
      ),
    },
    rows,
  })
}

async function taxCollectedReport(
  context: BranchAccessContext,
  dateFilter: { gte?: Date; lte?: Date },
  filters: TaxReportFilters
) {
  const taxLines = await prisma.transactionTaxLine.findMany({
    where: buildTaxLineWhere(context, dateFilter, filters),
    orderBy: [{ createdAt: 'desc' }, { taxName: 'asc' }],
  })

  const grouped = new Map<
    string,
    {
      date: string
      taxRateId: string | null
      taxName: string
      taxRatePercentage: number
      salesTaxableAmount: number
      salesTaxAmount: number
      returnTaxableAmount: number
      returnTaxAmount: number
    }
  >()

  for (const line of taxLines) {
    const date = line.createdAt.toISOString().split('T')[0]
    const key = `${date}:${line.taxRateId ?? line.taxName}:${line.taxRatePercentage}`
    const existing = grouped.get(key) ?? {
      date,
      taxRateId: line.taxRateId ?? null,
      taxName: line.taxName,
      taxRatePercentage: roundTaxAmount(line.taxRatePercentage),
      salesTaxableAmount: 0,
      salesTaxAmount: 0,
      returnTaxableAmount: 0,
      returnTaxAmount: 0,
    }

    const taxableAmount = Math.abs(line.taxableAmount)
    const taxAmount = Math.abs(line.taxAmount)
    if (isReturnTaxLine(line)) {
      existing.returnTaxableAmount = roundTaxAmount(
        existing.returnTaxableAmount + taxableAmount
      )
      existing.returnTaxAmount = roundTaxAmount(
        existing.returnTaxAmount + taxAmount
      )
    } else {
      existing.salesTaxableAmount = roundTaxAmount(
        existing.salesTaxableAmount + taxableAmount
      )
      existing.salesTaxAmount = roundTaxAmount(existing.salesTaxAmount + taxAmount)
    }

    grouped.set(key, existing)
  }

  const rows = Array.from(grouped.values())
    .map((row) => ({
      ...row,
      netTaxableAmount: roundTaxAmount(
        row.salesTaxableAmount - row.returnTaxableAmount
      ),
      netTaxAmount: roundTaxAmount(row.salesTaxAmount - row.returnTaxAmount),
    }))
    .sort((a, b) => {
      if (a.date === b.date) {
        return a.taxName.localeCompare(b.taxName)
      }

      return b.date.localeCompare(a.date)
    })

  return NextResponse.json({
    type: 'tax-collected',
    period: { start: dateFilter.gte, end: dateFilter.lte },
    summary: {
      periods: new Set(rows.map((row) => row.date)).size,
      totalCollectedTax: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.salesTaxAmount, 0)
      ),
      totalReturnedTax: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.returnTaxAmount, 0)
      ),
      netTax: roundTaxAmount(rows.reduce((sum, row) => sum + row.netTaxAmount, 0)),
    },
    rows,
  })
}

async function taxByInvoiceReport(
  context: BranchAccessContext,
  dateFilter: { gte?: Date; lte?: Date },
  filters: TaxReportFilters
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = approvedSaleWhere(
    applyBranchScope({ tenantId: context.tenantId }, context)
  )

  if (hasDateFilter(dateFilter)) {
    where.createdAt = dateFilter
  }

  if (filters.customerId) {
    where.customerId = filters.customerId
  }

  if (filters.productId) {
    where.items = { some: { itemId: filters.productId } }
  }

  if (filters.taxRateId) {
    where.taxLines = { some: { taxRateId: filters.taxRateId } }
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      customer: {
        select: {
          name: true,
        },
      },
      taxLines: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const invoices = sales.map((sale) => ({
    id: sale.id,
    createdAt: sale.createdAt,
    customerName: sale.customer?.name ?? 'Walk-in Customer',
    paymentType: sale.paymentType,
    subtotalAmount: roundTaxAmount(sale.subtotalAmount ?? sale.totalAmount),
    taxAmount: roundTaxAmount(sale.taxAmount ?? 0),
    totalAmount: roundTaxAmount(sale.totalAmount),
    taxBreakdown: summariseTaxBreakdown(sale.taxLines),
  }))

  return NextResponse.json({
    type: 'tax-by-invoice',
    period: { start: dateFilter.gte, end: dateFilter.lte },
    summary: {
      invoiceCount: invoices.length,
      totalSubtotal: roundTaxAmount(
        invoices.reduce((sum, invoice) => sum + invoice.subtotalAmount, 0)
      ),
      totalTax: roundTaxAmount(
        invoices.reduce((sum, invoice) => sum + invoice.taxAmount, 0)
      ),
      totalAmount: roundTaxAmount(
        invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0)
      ),
    },
    invoices,
  })
}

async function taxByProductReport(
  context: BranchAccessContext,
  dateFilter: { gte?: Date; lte?: Date },
  filters: TaxReportFilters
) {
  const taxLines = await prisma.transactionTaxLine.findMany({
    where: buildTaxLineWhere(context, dateFilter, filters),
    include: {
      saleItem: {
        select: {
          quantity: true,
          item: {
            select: {
              id: true,
              name: true,
              itemType: true,
            },
          },
        },
      },
      customerReturn: {
        select: {
          quantity: true,
          item: {
            select: {
              id: true,
              name: true,
              itemType: true,
            },
          },
        },
      },
    },
    orderBy: [{ taxName: 'asc' }, { createdAt: 'desc' }],
  })

  const grouped = new Map<
    string,
    {
      productId: string
      productName: string
      itemType: string
      soldQuantity: number
      returnedQuantity: number
      salesTaxableAmount: number
      salesTaxAmount: number
      returnTaxableAmount: number
      returnTaxAmount: number
      taxLines: Array<{
        taxRateId: string | null
        taxName: string
        taxRatePercentage: number
        taxableAmount: number
        taxAmount: number
      }>
    }
  >()

  for (const line of taxLines) {
    const product = line.saleItem?.item ?? line.customerReturn?.item
    if (!product) continue

    const key = product.id
    const existing = grouped.get(key) ?? {
      productId: product.id,
      productName: product.name,
      itemType: product.itemType,
      soldQuantity: 0,
      returnedQuantity: 0,
      salesTaxableAmount: 0,
      salesTaxAmount: 0,
      returnTaxableAmount: 0,
      returnTaxAmount: 0,
      taxLines: [],
    }

    const quantity = Math.abs(
      line.saleItem?.quantity ?? line.customerReturn?.quantity ?? 0
    )
    if (isReturnTaxLine(line)) {
      existing.returnedQuantity = roundTaxAmount(existing.returnedQuantity + quantity)
      existing.returnTaxableAmount = roundTaxAmount(
        existing.returnTaxableAmount + Math.abs(line.taxableAmount)
      )
      existing.returnTaxAmount = roundTaxAmount(
        existing.returnTaxAmount + Math.abs(line.taxAmount)
      )
    } else {
      existing.soldQuantity = roundTaxAmount(existing.soldQuantity + quantity)
      existing.salesTaxableAmount = roundTaxAmount(
        existing.salesTaxableAmount + Math.abs(line.taxableAmount)
      )
      existing.salesTaxAmount = roundTaxAmount(existing.salesTaxAmount + Math.abs(line.taxAmount))
    }

    existing.taxLines.push({
      taxRateId: line.taxRateId ?? null,
      taxName: line.taxName,
      taxRatePercentage: line.taxRatePercentage,
      taxableAmount: line.taxableAmount,
      taxAmount: line.taxAmount,
    })
    grouped.set(key, existing)
  }

  const rows = Array.from(grouped.values())
    .map((row) => ({
      ...row,
      netQuantity: roundTaxAmount(row.soldQuantity - row.returnedQuantity),
      netTaxableAmount: roundTaxAmount(
        row.salesTaxableAmount - row.returnTaxableAmount
      ),
      netTaxAmount: roundTaxAmount(row.salesTaxAmount - row.returnTaxAmount),
      taxBreakdown: summariseTaxBreakdown(row.taxLines),
    }))
    .sort((a, b) => {
      if (b.netTaxAmount !== a.netTaxAmount) {
        return b.netTaxAmount - a.netTaxAmount
      }

      return a.productName.localeCompare(b.productName)
    })

  return NextResponse.json({
    type: 'tax-by-product',
    period: { start: dateFilter.gte, end: dateFilter.lte },
    summary: {
      productCount: rows.length,
      totalSalesTax: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.salesTaxAmount, 0)
      ),
      totalReturnedTax: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.returnTaxAmount, 0)
      ),
      netTax: roundTaxAmount(rows.reduce((sum, row) => sum + row.netTaxAmount, 0)),
    },
    rows,
  })
}

async function taxLiabilityReport(
  context: BranchAccessContext,
  dateFilter: { gte?: Date; lte?: Date },
  filters: TaxReportFilters
) {
  const taxLines = await prisma.transactionTaxLine.findMany({
    where: buildTaxLineWhere(context, dateFilter, filters),
    include: {
      taxRate: {
        select: {
          id: true,
          taxPayableAccount: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ taxName: 'asc' }, { createdAt: 'desc' }],
  })

  const grouped = new Map<
    string,
    {
      accountId: string | null
      accountCode: string | null
      accountName: string | null
      taxRateId: string | null
      taxName: string
      taxRatePercentage: number
      collectedTaxableAmount: number
      collectedTax: number
      refundedTaxableAmount: number
      refundedTax: number
    }
  >()

  for (const line of taxLines) {
    const account = line.taxRate?.taxPayableAccount ?? null
    const key = `${account?.id ?? 'unmapped'}:${line.taxRateId ?? line.taxName}:${line.taxRatePercentage}`
    const existing = grouped.get(key) ?? {
      accountId: account?.id ?? null,
      accountCode: account?.code ?? null,
      accountName: account?.name ?? null,
      taxRateId: line.taxRateId ?? null,
      taxName: line.taxName,
      taxRatePercentage: roundTaxAmount(line.taxRatePercentage),
      collectedTaxableAmount: 0,
      collectedTax: 0,
      refundedTaxableAmount: 0,
      refundedTax: 0,
    }

    if (isReturnTaxLine(line)) {
      existing.refundedTaxableAmount = roundTaxAmount(
        existing.refundedTaxableAmount + Math.abs(line.taxableAmount)
      )
      existing.refundedTax = roundTaxAmount(
        existing.refundedTax + Math.abs(line.taxAmount)
      )
    } else {
      existing.collectedTaxableAmount = roundTaxAmount(
        existing.collectedTaxableAmount + Math.abs(line.taxableAmount)
      )
      existing.collectedTax = roundTaxAmount(
        existing.collectedTax + Math.abs(line.taxAmount)
      )
    }

    grouped.set(key, existing)
  }

  const rows = Array.from(grouped.values())
    .map((row) => ({
      ...row,
      netTaxLiability: roundTaxAmount(row.collectedTax - row.refundedTax),
      netTaxableAmount: roundTaxAmount(
        row.collectedTaxableAmount - row.refundedTaxableAmount
      ),
    }))
    .sort((a, b) => {
      if (b.netTaxLiability !== a.netTaxLiability) {
        return b.netTaxLiability - a.netTaxLiability
      }

      return a.taxName.localeCompare(b.taxName)
    })

  return NextResponse.json({
    type: 'tax-liability',
    period: { start: dateFilter.gte, end: dateFilter.lte },
    summary: {
      liabilityLines: rows.length,
      totalCollectedTax: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.collectedTax, 0)
      ),
      totalRefundedTax: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.refundedTax, 0)
      ),
      netTaxLiability: roundTaxAmount(
        rows.reduce((sum, row) => sum + row.netTaxLiability, 0)
      ),
    },
    rows,
  })
}
