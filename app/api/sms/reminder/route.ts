import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { sendSms, buildBalanceReminderSms } from '@/lib/sms/hubtel'
import { isBranchFilterActive, requireBranchAccess } from '@/lib/branch/server'
import { getScopedCustomerMetrics } from '@/lib/branch/scopedMetrics'

/**
 * POST /api/sms/reminder
 * Send a balance reminder SMS to a customer.
 * Requires: record_payments or manage_settings permission.
 *
 * Body: { customerId: string }
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'record_payments')
    if (!authorized) return permError!

    const body = await req.json()
    const { customerId } = body

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }

    // Verify customer belongs to tenant
    const [customer, metrics] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: customerId, tenantId: context!.tenantId },
      }),
      getScopedCustomerMetrics(context!, [customerId]),
    ])

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const scopedBalance = isBranchFilterActive(context!)
      ? (metrics.get(customerId)?.balance ?? 0)
      : customer.balance

    if (!customer.phone) {
      return NextResponse.json({ error: 'Customer has no phone number on file' }, { status: 400 })
    }

    if (scopedBalance <= 0) {
      return NextResponse.json({ error: 'Customer has no outstanding balance' }, { status: 400 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: {
        name: true,
        enableSmsNotifications: true,
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelSenderId: true,
      },
    })

    if (!tenant?.enableSmsNotifications) {
      return NextResponse.json({ error: 'SMS notifications are not enabled for this business' }, { status: 400 })
    }

    if (!tenant.hubtelClientId || !tenant.hubtelClientSecret || !tenant.hubtelSenderId) {
      return NextResponse.json({ error: 'Hubtel SMS credentials are not configured' }, { status: 400 })
    }

    const message = buildBalanceReminderSms({
      businessName: tenant.name,
      customerName: customer.name,
      balance: scopedBalance,
    })

    const result = await sendSms(
      { clientId: tenant.hubtelClientId, clientSecret: tenant.hubtelClientSecret, senderId: tenant.hubtelSenderId },
      customer.phone,
      message,
    )

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 })
    }

    return NextResponse.json({ success: true, messageId: result.messageId })
  } catch (err) {
    console.error('SMS reminder error:', err)
    return NextResponse.json({ error: 'Failed to send reminder SMS' }, { status: 500 })
  }
}
