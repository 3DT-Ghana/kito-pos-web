import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import {
  applyBranchScope,
  isBranchFilterActive,
  requireBranchAccess,
} from '@/lib/branch/server'
import { getScopedSupplierMetrics } from '@/lib/branch/scopedMetrics'

/**
 * Supplier Detail API Routes
 *
 * GET /api/suppliers/[id] - Get supplier by ID with transaction history
 * PUT /api/suppliers/[id] - Update supplier
 * DELETE /api/suppliers/[id] - Delete supplier
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/suppliers/[id]
 * Get a specific supplier with transaction history
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'view_suppliers')
    if (!authorized) return permError!

    const { id } = await params

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const purchasesWhere: any = { supplierId: id, tenantId: context!.tenantId }
    if (startDate || endDate) {
      purchasesWhere.createdAt = {}
      if (startDate) purchasesWhere.createdAt.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        purchasesWhere.createdAt.lte = end
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentsWhere: any = applyBranchScope(
      { supplierId: id, tenantId: context!.tenantId },
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
      OR: [{ debitSupplierId: id }, { creditSupplierId: id }],
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

    const [supplier, purchases, payments, transfers, metrics] = await Promise.all([
      prisma.supplier.findFirst({
        where: { id, tenantId: context!.tenantId },
        select: {
          id: true,
          name: true,
          phone: true,
          balance: true,
        },
      }),
      prisma.purchase.findMany({
        where: applyBranchScope(purchasesWhere, context!),
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              item: { select: { name: true, manufacturer: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.supplierPayment.findMany({
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
          debitSupplierId: true,
          creditPartyType: true,
          creditSupplierId: true,
          debitCustomer:  { select: { id: true, name: true } },
          creditCustomer: { select: { id: true, name: true } },
          debitSupplier:  { select: { id: true, name: true } },
          creditSupplier: { select: { id: true, name: true } },
          debitAccount:   { select: { id: true, name: true, code: true } },
          creditAccount:  { select: { id: true, name: true, code: true } },
        },
      }),
      getScopedSupplierMetrics(context!, [id]),
    ])

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    const metric = metrics.get(id)
    const scopedBalance = isBranchFilterActive(context!)
      ? (metric?.balance ?? 0)
      : supplier.balance
    const totalPurchases = purchases.reduce((sum, p) => sum + p.totalAmount, 0)
    const totalPaid = purchases.reduce((sum, p) => sum + p.paidAmount, 0)
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0)

    return NextResponse.json({
      ...supplier,
      balance: scopedBalance,
      purchases,
      payments,
      transfers,
      _count: {
        purchases: metric?.transactionCount ?? purchases.length,
      },
      summary: {
        totalPurchases,
        totalPaid,
        totalPayments,
        currentBalance: scopedBalance,
      },
    })
  } catch (err) {
    console.error('Failed to fetch supplier:', err)
    return NextResponse.json(
      { error: 'Failed to fetch supplier' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/suppliers/[id]
 * Update a supplier
 * Requires: update_suppliers permission
 * Note: Balance cannot be updated directly (updated through purchases/payments)
 */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'update_suppliers')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()

    // Check supplier exists and belongs to tenant
    const existing = await prisma.supplier.findFirst({
      where: { id, tenantId: context!.tenantId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }

    // Validate
    if (body.name !== undefined && (!body.name || typeof body.name !== 'string' || !body.name.trim())) {
      return NextResponse.json(
        { error: 'Supplier name must be a non-empty string' },
        { status: 400 }
      )
    }

    // Prevent direct balance updates
    if (body.balance !== undefined) {
      return NextResponse.json(
        { error: 'Cannot update balance directly. Use purchases or payments.' },
        { status: 400 }
      )
    }

    // Name AND phone together, matching POST — an OR made two namesakes on
    // different numbers permanently uneditable.
    if (body.name || body.phone) {
      const candidateName = (body.name ?? existing.name)?.trim()
      const candidatePhone = (body.phone ?? existing.phone)?.trim() || null

      const duplicate = await prisma.supplier.findFirst({
        where: {
          tenantId: context!.tenantId,
          name: { equals: candidateName, mode: 'insensitive' as const },
          phone: candidatePhone,
          id: { not: id },
        },
      })

      if (duplicate) {
        return NextResponse.json(
          { error: 'A supplier with this name and phone number already exists' },
          { status: 409 }
        )
      }
    }

    // Update supplier
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.phone !== undefined && { phone: body.phone ? body.phone.trim() : null }),
      },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    })

    return NextResponse.json(supplier)
  } catch (err) {
    console.error('Failed to update supplier:', err)
    return NextResponse.json(
      { error: 'Failed to update supplier' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/suppliers/[id]
 * Delete a supplier
 * Requires: delete_suppliers permission
 * Note: Cannot delete if supplier has outstanding balance or purchases
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'delete_suppliers')
    if (!authorized) return permError!

    const { id } = await params

    // Check supplier exists and belongs to tenant
    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    })

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }

    // Check if supplier has outstanding balance
    if (supplier.balance > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete supplier with outstanding balance',
          balance: supplier.balance,
        },
        { status: 409 }
      )
    }

    // Check if supplier has purchase history
    if (supplier._count.purchases > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete supplier with purchase history',
          purchasesCount: supplier._count.purchases,
        },
        { status: 409 }
      )
    }

    // Delete supplier
    await prisma.supplier.delete({
      where: { id },
    })

    return NextResponse.json(
      { message: 'Supplier deleted successfully' },
      { status: 200 }
    )
  } catch (err) {
    console.error('Failed to delete supplier:', err)
    return NextResponse.json(
      { error: 'Failed to delete supplier' },
      { status: 500 }
    )
  }
}
