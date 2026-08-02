import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { sendWhatsApp, buildWhatsAppBalanceReminder } from '@/lib/whatsapp/meta'
import { sendSms, buildBalanceReminderSms } from '@/lib/sms/hubtel'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/customers/[id]/notify
 * Send a WhatsApp (or SMS) balance reminder to a customer.
 * Body: { channel: 'whatsapp' | 'sms' | 'both' }
 */
// Every message here is billable. Without a cooldown a loop over this endpoint
// bills the tenant without limit, and the only throttle was a client-side
// disabled button.
const REMINDER_COOLDOWN_MS = 5 * 60 * 1000
const lastReminderAt = new Map<string, number>()

function checkCooldown(key: string): number {
  const last = lastReminderAt.get(key)
  if (last === undefined) return 0
  const elapsed = Date.now() - last
  return elapsed >= REMINDER_COOLDOWN_MS ? 0 : Math.ceil((REMINDER_COOLDOWN_MS - elapsed) / 1000)
}

function recordSend(key: string) {
  const now = Date.now()
  lastReminderAt.set(key, now)
  // Opportunistic cleanup so the map cannot grow without bound
  if (lastReminderAt.size > 1000) {
    for (const [k, v] of lastReminderAt) {
      if (now - v > REMINDER_COOLDOWN_MS) lastReminderAt.delete(k)
    }
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Was completely unprotected — the least-privileged user in the tenant
    // could send paid messages, while the equivalent /api/sms/reminder route
    // requires record_payments.
    const { authorized, error: permError } = requirePermission(context!, 'record_payments')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const channel: string = body.channel ?? 'whatsapp'

    const cooldownKey = `${context!.tenantId}:${id}`
    const retryAfter = checkCooldown(cooldownKey)
    if (retryAfter > 0) {
      return NextResponse.json(
        {
          error: `A reminder was already sent to this customer recently. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

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
        // On `both`, WhatsApp may already have been sent and billed — returning
        // a bare 400 here discarded that result and reported pure failure.
        if (results.whatsapp === 'sent') {
          recordSend(cooldownKey)
          return NextResponse.json(
            {
              success: true,
              partial: true,
              results,
              warning: 'WhatsApp reminder sent. SMS is not configured for this account, so no text message was sent.',
            },
            { status: 200 }
          )
        }
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

    // A send failure was previously reported as HTTP 200 with success: true,
    // so the UI cheerfully said "reminder sent" for a message that never went.
    const sent = Object.values(results).filter(v => v === 'sent')
    const failed = Object.entries(results).filter(([, v]) => v !== 'sent')

    if (sent.length === 0) {
      return NextResponse.json(
        {
          error: failed.map(([channelName, detail]) => `${channelName}: ${detail}`).join('; ')
            || 'Failed to send reminder',
          results,
        },
        { status: 502 }
      )
    }

    recordSend(cooldownKey)
    return NextResponse.json({
      success: true,
      ...(failed.length > 0 ? { partial: true } : {}),
      results,
    })
  } catch (err) {
    console.error('[notify customer]', err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
