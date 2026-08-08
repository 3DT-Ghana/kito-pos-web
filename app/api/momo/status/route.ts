import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { prisma } from '@/lib/db/prisma'
import { getMomoStatus } from '@/lib/momo/hubtelCollect'

/**
 * GET /api/momo/status?clientReference=xxx
 *
 * Check a MoMo payment's status. Hubtel keys this by our own clientReference,
 * not their transaction id, and treats it as the fallback for when a callback
 * has not arrived within five minutes rather than the primary path.
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { searchParams } = new URL(req.url)
    // transactionId is still accepted so a till running older JS keeps working
    // through a deploy.
    const clientReference =
      searchParams.get('clientReference') ?? searchParams.get('transactionId')

    if (!clientReference) {
      return NextResponse.json({ error: 'clientReference is required' }, { status: 400 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: {
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelCollectionAccount: true,
      },
    })

    if (!tenant?.hubtelClientId || !tenant?.hubtelClientSecret) {
      return NextResponse.json({ error: 'Hubtel not configured' }, { status: 422 })
    }

    const result = await getMomoStatus(
      {
        clientId: tenant.hubtelClientId,
        clientSecret: tenant.hubtelClientSecret,
        collectionAccount: tenant.hubtelCollectionAccount ?? '',
      },
      clientReference
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    return NextResponse.json({ status: result.status })
  } catch (err) {
    console.error('MoMo status error:', err)
    return NextResponse.json({ error: 'Failed to check MoMo status' }, { status: 500 })
  }
}
