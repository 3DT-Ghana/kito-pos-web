import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { sendSms } from '@/lib/sms/hubtel'

/**
 * POST /api/sms/test
 * Send a test SMS to verify Hubtel credentials.
 * OWNER only.
 *
 * Body: { to: string }
 */
export async function POST(req: Request) {
  try {
    const { error, tenantId, user, rolePermissions } = await requireTenant()
    if (error) return error!

    const { authorized, error: permError } = requirePermission(
      { role: user!.role, rolePermissions },
      'manage_settings'
    )
    if (!authorized) return permError!

    const body = await req.json()
    const { to } = body

    if (!to) {
      return NextResponse.json({ error: 'to (phone number) is required' }, { status: 400 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId! },
      select: {
        name: true,
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelSenderId: true,
      },
    })

    if (!tenant?.hubtelClientId || !tenant.hubtelClientSecret || !tenant.hubtelSenderId) {
      return NextResponse.json({ error: 'Hubtel SMS credentials are not configured' }, { status: 400 })
    }

    const result = await sendSms(
      {
        clientId: tenant.hubtelClientId,
        clientSecret: tenant.hubtelClientSecret,
        senderId: tenant.hubtelSenderId,
      },
      to,
      `${tenant.name}: This is a test SMS. SMS notifications are working correctly!`,
    )

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 })
    }

    return NextResponse.json({ success: true, messageId: result.messageId })
  } catch (err) {
    console.error('SMS test error:', err)
    return NextResponse.json({ error: 'Failed to send test SMS' }, { status: 500 })
  }
}
