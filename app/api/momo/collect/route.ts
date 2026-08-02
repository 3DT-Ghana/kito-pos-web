import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { prisma } from '@/lib/db/prisma'
import { sendMomoCollect } from '@/lib/momo/hubtelCollect'

/**
 * POST /api/momo/collect
 * Sends a MoMo payment prompt to a customer's phone via Hubtel.
 * Body: { amount, phoneNumber, description, clientReference }
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const body = await req.json()
    const { amount, phoneNumber, description, clientReference } = body

    if (!amount || !phoneNumber || !clientReference) {
      return NextResponse.json(
        { error: 'amount, phoneNumber, and clientReference are required' },
        { status: 400 }
      )
    }

    // Load tenant Hubtel credentials
    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { hubtelClientId: true, hubtelClientSecret: true, name: true },
    })

    if (!tenant?.hubtelClientId || !tenant?.hubtelClientSecret) {
      return NextResponse.json(
        { error: 'MoMo collection is not configured. Add Hubtel credentials in Settings → SMS.' },
        { status: 422 }
      )
    }

    const result = await sendMomoCollect(
      { clientId: tenant.hubtelClientId, clientSecret: tenant.hubtelClientSecret },
      {
        amount: parseFloat(String(amount)),
        phoneNumber: String(phoneNumber),
        description: description || `Payment to ${tenant.name}`,
        clientReference: String(clientReference),
      }
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    return NextResponse.json({ transactionId: result.transactionId })
  } catch (err) {
    console.error('MoMo collect error:', err)
    return NextResponse.json({ error: 'Failed to send MoMo request' }, { status: 500 })
  }
}
