import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { PaymentMethod } from '@prisma/client'
import {
  applyBranchScope,
  isBranchFilterActive,
  requireBranchAccess,
  requireOperationalBranch,
} from '@/lib/branch/server'
import { getScopedSupplierMetrics } from '@/lib/branch/scopedMetrics'
import { postSupplierPaymentJournal } from '@/lib/accounting/journalEngine'

/**
 * Supplier Payments API
 *
 * GET /api/payments/suppliers - List all supplier payments
 * POST /api/payments/suppliers - Record supplier payment (reduce credit)
 */

/**
 * GET /api/payments/suppliers
 * List all supplier payments
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'record_payments')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const supplierId = searchParams.get('supplierId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = applyBranchScope({ tenantId: context!.tenantId }, context!)

    if (supplierId) {
      where.supplierId = supplierId
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
    }

    const payments = await prisma.supplierPayment.findMany({
      where,
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })

    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0)

    return NextResponse.json({
      payments,
      summary: {
        total: payments.length,
        totalAmount,
      },
    })
  } catch (err) {
    console.error('Failed to fetch supplier payments:', err)
    return NextResponse.json(
      { error: 'Failed to fetch supplier payments' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/payments/suppliers
 * Record a supplier payment (reduces supplier credit balance)
 * Requires: record_payments permission
 *
 * Atomically:
 * 1. Creates payment record
 * 2. Reduces supplier balance
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'record_payments')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before recording a supplier payment.'
    )
    if (branchError) return branchError

    const body = await req.json()

    // Validate
    if (!body.supplierId || typeof body.supplierId !== 'string') {
      return NextResponse.json(
        { error: 'Supplier ID is required' },
        { status: 400 }
      )
    }

    if (!body.amount || isNaN(parseFloat(body.amount)) || parseFloat(body.amount) <= 0) {
      return NextResponse.json(
        { error: 'Payment amount must be a positive number' },
        { status: 400 }
      )
    }

    const allowedMethods = [PaymentMethod.CASH, PaymentMethod.MOMO, PaymentMethod.BANK]
    if (!body.method || !allowedMethods.includes(body.method)) {
      return NextResponse.json(
        { error: 'Valid payment method is required (CASH, MOMO, BANK)' },
        { status: 400 }
      )
    }
    if (body.method === PaymentMethod.MOMO && !body.momoPhone?.trim()) {
      return NextResponse.json({ error: 'MoMo phone number is required' }, { status: 400 })
    }

    // Verify supplier belongs to tenant
    const [supplier, metrics] = await Promise.all([
      prisma.supplier.findFirst({
        where: { id: body.supplierId, tenantId: context!.tenantId },
      }),
      getScopedSupplierMetrics(context!, [body.supplierId]),
    ])

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found or does not belong to your tenant' },
        { status: 404 }
      )
    }

    const amount = parseFloat(body.amount)
    const scopedMetric = metrics.get(body.supplierId)
    const visibleBalance = isBranchFilterActive(context!)
      ? Math.min(scopedMetric?.balance ?? 0, supplier.balance)
      : supplier.balance

    // Check if payment exceeds balance
    if (amount > visibleBalance) {
      return NextResponse.json(
        {
          error: 'Payment amount exceeds supplier balance',
          supplierBalance: visibleBalance,
          paymentAmount: amount,
        },
        { status: 400 }
      )
    }

    // Fetch accounting flag before transaction
    const tenantSettings = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { enableAccounting: true },
    })
    const accountingEnabled = tenantSettings?.enableAccounting ?? false

    // Execute atomic transaction
    const payment = await prisma.$transaction(async (tx) => {
      // 1. Create payment record
      const newPayment = await tx.supplierPayment.create({
        data: {
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled ? { branchId } : {}),
          supplierId: body.supplierId,
          amount,
          method: body.method as PaymentMethod,
          momoPhone:       body.method === PaymentMethod.MOMO ? String(body.momoPhone ?? '').trim() || null : null,
          bankName:        body.method === PaymentMethod.BANK ? String(body.bankName ?? '').trim() || null : null,
          bankAccountName: body.method === PaymentMethod.BANK ? String(body.bankAccountName ?? '').trim() || null : null,
          bankReference:   body.method === PaymentMethod.BANK ? String(body.bankReference ?? '').trim() || null : null,
        },
      })

      // 2. Reduce supplier balance. Conditional on the balance still covering
      // the amount — the check above runs outside this transaction, so two
      // concurrent payments could each pass it and drive the balance negative.
      const balanceUpdate = await tx.supplier.updateMany({
        where: {
          id: body.supplierId,
          tenantId: context!.tenantId,
          balance: { gte: amount },
        },
        data: {
          balance: {
            decrement: amount,
          },
        },
      })
      if (balanceUpdate.count !== 1) {
        throw new Error(
          'The supplier balance changed while this payment was being recorded. Please check the balance and try again.'
        )
      }

      // 3. Post journal entry (if accounting enabled)
      if (accountingEnabled) {
        await postSupplierPaymentJournal(tx, {
          tenantId: context!.tenantId,
          supplierPaymentId: newPayment.id,
          postedById: context!.user.id,
          amount,
          paymentMethod: body.method as PaymentMethod,
        })
      }

      return newPayment
    })

    // Fetch updated supplier
    const updatedSupplier = await prisma.supplier.findUnique({
      where: { id: body.supplierId },
    })
    const scopedNewBalance = Math.max(0, visibleBalance - amount)

    return NextResponse.json(
      {
        payment,
        supplier: {
          id: updatedSupplier?.id,
          name: updatedSupplier?.name,
          previousBalance: visibleBalance,
          newBalance: isBranchFilterActive(context!)
            ? scopedNewBalance
            : (updatedSupplier?.balance ?? 0),
          amountPaid: amount,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Failed to record supplier payment:', err)
    return NextResponse.json(
      { error: 'Failed to record supplier payment' },
      { status: 500 }
    )
  }
}
