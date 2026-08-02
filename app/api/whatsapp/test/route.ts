import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { prisma } from '@/lib/db/prisma'
import { sendWhatsApp } from '@/lib/whatsapp/meta'

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { to } = await req.json()
    if (!to) return NextResponse.json({ error: 'Phone number required' }, { status: 400 })

    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { name: true, enableWhatsApp: true, metaWabaToken: true, metaWabaPhoneNumberId: true },
    })

    if (!tenant?.metaWabaToken || !tenant?.metaWabaPhoneNumberId) {
      return NextResponse.json({ error: 'WhatsApp credentials not configured' }, { status: 400 })
    }

    const message =
      `✅ *Test Message — ${tenant.name}*\n\n` +
      `Your WhatsApp integration is working correctly.\n\n` +
      `You can now send payment receipts, balance reminders, and delivery notifications to your customers via WhatsApp. 🎉`

    const result = await sendWhatsApp(
      { token: tenant.metaWabaToken, phoneNumberId: tenant.metaWabaPhoneNumberId },
      to,
      message,
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send' }, { status: 502 })
    }

    return NextResponse.json({ success: true, messageId: result.messageId })
  } catch (err) {
    console.error('[whatsapp test]', err)
    return NextResponse.json({ error: 'Failed to send test message' }, { status: 500 })
  }
}
