import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { sendWhatsApp, buildWhatsAppBalanceReminder } from '@/lib/whatsapp/meta'
import { sendSms, buildBalanceReminderSms } from '@/lib/sms/hubtel'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/customers/[id]/notify
 * Send a WhatsApp (or SMS) balance reminder to a customer.
 * Body: { channel: 'whatsapp' | 'sms' | 'both' }
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const channel: string = body.channel ?? 'whatsapp'

    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: context!.tenantId },
      select: { id: true, name: true, phone: true, balance: true },
    })

    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    if (!customer.phone) return NextResponse.json({ error: 'Customer has no phone number' }, { status: 400 })
    if (customer.balance <= 0) return NextResponse.json({ error: 'Customer has no outstanding balance' }, { status: 400 })

    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: {
        name: true,
        enableWhatsApp: true,
        metaWabaToken: true,
        metaWabaPhoneNumberId: true,
        enableSmsNotifications: true,
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelSenderId: true,
      },
    })

    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const results: { whatsapp?: string; sms?: string } = {}

    const wantWhatsApp = channel === 'whatsapp' || channel === 'both'
    const wantSms = channel === 'sms' || channel === 'both'

    if (wantWhatsApp) {
      if (!tenant.enableWhatsApp || !tenant.metaWabaToken || !tenant.metaWabaPhoneNumberId) {
        return NextResponse.json({ error: 'WhatsApp is not configured for this account' }, { status: 400 })
      }
      const message = buildWhatsAppBalanceReminder({
        businessName: tenant.name,
        customerName: customer.name,
        balance: customer.balance,
      })
      const res = await sendWhatsApp(
        { token: tenant.metaWabaToken, phoneNumberId: tenant.metaWabaPhoneNumberId },
        customer.phone,
        message,
      )
      results.whatsapp = res.success ? 'sent' : `failed: ${res.error}`
    }

    if (wantSms) {
      if (!tenant.enableSmsNotifications || !tenant.hubtelClientId || !tenant.hubtelClientSecret || !tenant.hubtelSenderId) {
        return NextResponse.json({ error: 'SMS is not configured for this account' }, { status: 400 })
      }
      const message = buildBalanceReminderSms({
        businessName: tenant.name,
        customerName: customer.name,
        balance: customer.balance,
      })
      const res = await sendSms(
        { clientId: tenant.hubtelClientId, clientSecret: tenant.hubtelClientSecret, senderId: tenant.hubtelSenderId },
        customer.phone,
        message,
      )
      results.sms = res.success ? 'sent' : `failed: ${res.error}`
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    console.error('[notify customer]', err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
