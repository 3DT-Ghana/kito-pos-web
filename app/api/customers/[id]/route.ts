import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import {
  applyBranchScope,
  isBranchFilterActive,
  requireBranchAccess,
} from '@/lib/branch/server'
import { approvedSaleWhere } from '@/lib/approvals/sales'
import { getScopedCustomerMetrics } from '@/lib/branch/scopedMetrics'

/**
 * Customer Detail API Routes
 *
 * GET /api/customers/[id] - Get customer by ID with transaction history
 * PUT /api/customers/[id] - Update customer
 * DELETE /api/customers/[id] - Delete customer
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/customers/[id]
 * Get a specific customer with transaction history
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { id } = await params
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const salesWhere: any = { customerId: id, tenantId: context!.tenantId }
    if (startDate || endDate) {
      salesWhere.createdAt = {}
      if (startDate) salesWhere.createdAt.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        salesWhere.createdAt.lte = end
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentsWhere: any = applyBranchScope(
      { customerId: id, tenantId: context!.tenantId },
      context!
    )
    if (startDate || endDate) {
      paymentsWhere.createdAt = {}
      if (startDate) paymentsWhere.createdAt.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        paymentsWhere.createdAt.lte = end
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transfersWhere: any = {
      tenantId: context!.tenantId,
      OR: [{ debitCustomerId: id }, { creditCustomerId: id }],
    }
    if (startDate || endDate) {
      transfersWhere.date = {}
      if (startDate) transfersWhere.date.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        transfersWhere.date.lte = end
      }
    }

    const [customer, sales, payments, transfers, metrics] = await Promise.all([
      prisma.customer.findFirst({
        where: { id, tenantId: context!.tenantId },
        select: {
          id: true,
          name: true,
          phone: true,
          balance: true,
        },
      }),
      prisma.sale.findMany({
        where: approvedSaleWhere(applyBranchScope(salesWhere, context!)),
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              item: { select: { name: true, manufacturer: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.customerPayment.findMany({
        where: paymentsWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.ledgerTransfer.findMany({
        where: transfersWhere,
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          amount: true,
          description: true,
          debitPartyType: true,
          debitCustomerId: true,
          creditPartyType: true,
          creditCustomerId: true,
          debitCustomer:  { select: { id: true, name: true } },
          creditCustomer: { select: { id: true, name: true } },
          debitSupplier:  { select: { id: true, name: true } },
          creditSupplier: { select: { id: true, name: true } },
          debitAccount:   { select: { id: true, name: true, code: true } },
          creditAccount:  { select: { id: true, name: true, code: true } },
        },
      }),
      getScopedCustomerMetrics(context!, [id]),
    ])

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const metric = metrics.get(id)
    const scopedBalance = isBranchFilterActive(context!)
      ? (metric?.balance ?? 0)
      : customer.balance
    const totalSales = sales.reduce((sum, sale) => sum + sale.totalAmount, 0)
    const totalPaid = sales.reduce((sum, sale) => sum + sale.paidAmount, 0)
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0)

    return NextResponse.json({
      ...customer,
      balance: scopedBalance,
      sales,
      payments,
      transfers,
      _count: {
        sales: metric?.transactionCount ?? sales.length,
      },
      summary: {
        totalSales,
        totalPaid,
        totalPayments,
        currentBalance: scopedBalance,
      },
    })
  } catch (err) {
    console.error('Failed to fetch customer:', err)
    return NextResponse.json(
      { error: 'Failed to fetch customer' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/customers/[id]
 * Update a customer
 * Requires: update_customers permission
 * Note: Balance cannot be updated directly (updated through sales/payments)
 */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'update_customers')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()

    // Check customer exists and belongs to tenant
    const existing = await prisma.customer.findFirst({
      where: { id, tenantId: context!.tenantId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    // Validate
    if (body.name !== undefined && (!body.name || typeof body.name !== 'string')) {
      return NextResponse.json(
        { error: 'Customer name must be a non-empty string' },
        { status: 400 }
      )
    }

    // Prevent direct balance updates
    if (body.balance !== undefined) {
      return NextResponse.json(
        { error: 'Cannot update balance directly. Use sales or payments.' },
        { status: 400 }
      )
    }

    // Check for duplicate name or phone (excluding current customer)
    if (body.name || body.phone) {
      const duplicate = await prisma.customer.findFirst({
        where: {
          tenantId: context!.tenantId,
          OR: [
            ...(body.name
              ? [
                  {
                    name: {
                      equals: body.name.trim(),
                      mode: 'insensitive' as const,
                    },
                  },
                ]
              : []),
            ...(body.phone
              ? [
                  {
                    phone: body.phone.trim(),
                  },
                ]
              : []),
          ],
          id: { not: id },
        },
      })

      if (duplicate) {
        return NextResponse.json(
          { error: 'A customer with this name or phone already exists' },
          { status: 409 }
        )
      }
    }

    // Update customer
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.phone !== undefined && { phone: body.phone ? body.phone.trim() : null }),
      },
      include: {
        _count: {
          select: { sales: true },
        },
      },
    })

    return NextResponse.json(customer)
  } catch (err) {
    console.error('Failed to update customer:', err)
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/customers/[id]
 * Delete a customer
 * Requires: delete_customers permission
 * Note: Cannot delete if customer has outstanding balance or sales
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'delete_customers')
    if (!authorized) return permError!

    const { id } = await params

    // Check customer exists and belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: {
        _count: {
          select: { sales: true },
        },
      },
    })

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    // Check if customer has outstanding balance
    if (customer.balance > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete customer with outstanding balance',
          balance: customer.balance,
        },
        { status: 409 }
      )
    }

    // Check if customer has sales history
    if (customer._count.sales > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete customer with sales history',
          salesCount: customer._count.sales,
        },
        { status: 409 }
      )
    }

    // Delete customer
    await prisma.customer.delete({
      where: { id },
    })

    return NextResponse.json(
      { message: 'Customer deleted successfully' },
      { status: 200 }
    )
  } catch (err) {
    console.error('Failed to delete customer:', err)
    return NextResponse.json(
      { error: 'Failed to delete customer' },
      { status: 500 }
    )
  }
}
