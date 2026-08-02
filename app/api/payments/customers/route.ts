import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { PaymentMethod } from '@prisma/client'
import { sendSms, buildPaymentReceivedSms } from '@/lib/sms/hubtel'
import { sendWhatsApp, buildWhatsAppPaymentReceipt } from '@/lib/whatsapp/meta'
import {
  applyBranchScope,
  isBranchFilterActive,
  requireBranchAccess,
  requireOperationalBranch,
} from '@/lib/branch/server'
import { getScopedCustomerMetrics } from '@/lib/branch/scopedMetrics'
import { postCustomerPaymentJournal } from '@/lib/accounting/journalEngine'

/**
 * Customer Payments API
 *
 * GET /api/payments/customers - List all customer payments
 * POST /api/payments/customers - Record customer payment (reduce debt)
 */

/**
 * GET /api/payments/customers
 * List all customer payments
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = applyBranchScope({ tenantId: context!.tenantId }, context!)

    if (customerId) {
      where.customerId = customerId
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
    }

    const payments = await prisma.customerPayment.findMany({
      where,
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
    console.error('Failed to fetch customer payments:', err)
    return NextResponse.json(
      { error: 'Failed to fetch customer payments' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/payments/customers
 * Record a customer payment (reduces customer balance)
 * Requires: record_payments permission
 *
 * Atomically:
 * 1. Creates payment record
 * 2. Reduces customer balance
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'record_payments')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before recording a customer payment.'
    )
    if (branchError) return branchError

    const body = await req.json()

    // Validate
    if (!body.customerId || typeof body.customerId !== 'string') {
      return NextResponse.json(
        { error: 'Customer ID is required' },
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

    // Verify customer belongs to tenant
    const [customer, metrics] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: body.customerId, tenantId: context!.tenantId },
      }),
      getScopedCustomerMetrics(context!, [body.customerId]),
    ])

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found or does not belong to your tenant' },
        { status: 404 }
      )
    }

    const amount = parseFloat(body.amount)
    const scopedMetric = metrics.get(body.customerId)
    const visibleBalance = isBranchFilterActive(context!)
      ? Math.min(scopedMetric?.balance ?? 0, customer.balance)
      : customer.balance

    // Check if payment exceeds balance
    if (amount > visibleBalance) {
      return NextResponse.json(
        {
          error: 'Payment amount exceeds customer balance',
          customerBalance: visibleBalance,
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
      const newPayment = await tx.customerPayment.create({
        data: {
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled ? { branchId } : {}),
          customerId: body.customerId,
          amount,
          method: body.method as PaymentMethod,
          momoPhone:       body.method === PaymentMethod.MOMO ? String(body.momoPhone ?? '').trim() || null : null,
          bankName:        body.method === PaymentMethod.BANK ? String(body.bankName ?? '').trim() || null : null,
          bankAccountName: body.method === PaymentMethod.BANK ? String(body.bankAccountName ?? '').trim() || null : null,
          bankReference:   body.method === PaymentMethod.BANK ? String(body.bankReference ?? '').trim() || null : null,
        },
      })

      // 2. Reduce customer balance
      await tx.customer.update({
        where: { id: body.customerId },
        data: {
          balance: {
            decrement: amount,
          },
        },
      })

      // 3. Post journal entry (if accounting enabled)
      if (accountingEnabled) {
        await postCustomerPaymentJournal(tx, {
          tenantId: context!.tenantId,
          customerPaymentId: newPayment.id,
          postedById: context!.user.id,
          amount,
          paymentMethod: body.method as PaymentMethod,
        })
      }

      return newPayment
    })

    // Fetch updated customer
    const updatedCustomer = await prisma.customer.findUnique({
      where: { id: body.customerId },
    })
    const scopedNewBalance = Math.max(0, visibleBalance - amount)

    // Send SMS / WhatsApp notifications (fire-and-forget — don't block or fail the payment)
    if (customer.phone) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: context!.tenantId },
        select: {
          name: true,
          enableSmsNotifications: true,
          hubtelClientId: true,
          hubtelClientSecret: true,
          hubtelSenderId: true,
          enableWhatsApp: true,
          metaWabaToken: true,
          metaWabaPhoneNumberId: true,
        },
      })

      const newBalance = isBranchFilterActive(context!)
        ? scopedNewBalance
        : (updatedCustomer?.balance ?? 0)

      if (
        tenant?.enableSmsNotifications &&
        tenant.hubtelClientId &&
        tenant.hubtelClientSecret &&
        tenant.hubtelSenderId
      ) {
        const message = buildPaymentReceivedSms({
          businessName: tenant.name,
          customerName: customer.name,
          amount,
          balance: newBalance,
        })
        sendSms(
          { clientId: tenant.hubtelClientId, clientSecret: tenant.hubtelClientSecret, senderId: tenant.hubtelSenderId },
          customer.phone,
          message,
        ).catch(() => {})
      }

      if (tenant?.enableWhatsApp && tenant.metaWabaToken && tenant.metaWabaPhoneNumberId) {
        const message = buildWhatsAppPaymentReceipt({
          businessName: tenant.name,
          customerName: customer.name,
          amount,
          balance: newBalance,
          paymentMethod: body.paymentMethod,
        })
        sendWhatsApp(
          { token: tenant.metaWabaToken, phoneNumberId: tenant.metaWabaPhoneNumberId },
          customer.phone,
          message,
        ).catch(() => {})
      }
    }

    return NextResponse.json(
      {
        payment,
        customer: {
          id: updatedCustomer?.id,
          name: updatedCustomer?.name,
          previousBalance: visibleBalance,
          newBalance: isBranchFilterActive(context!)
            ? scopedNewBalance
            : (updatedCustomer?.balance ?? 0),
          amountPaid: amount,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Failed to record customer payment:', err)
    return NextResponse.json(
      { error: 'Failed to record customer payment' },
      { status: 500 }
    )
  }
}
