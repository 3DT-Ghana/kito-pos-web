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
      // 200 with success:false, as the collect route does: a 5xx body can be
      // replaced by a proxy's own HTML error page, which loses the reason and
      // breaks the caller's JSON parse.
      return NextResponse.json({ success: false, error: result.error })
    }

    // Keep our record in step. Hubtel's callback usually gets here first, but
    // when it does not arrive this poll is the only thing that closes the row —
    // and a PENDING row is what the recovery list works from.
    if (result.status === 'success' || result.status === 'failed') {
      await prisma.momoTransaction.updateMany({
        where: {
          clientReference,
          tenantId: context!.tenantId,
          status: 'PENDING',
        },
        data: {
          status: result.status === 'success' ? 'SUCCESS' : 'FAILED',
          completedAt: new Date(),
          ...(result.status === 'failed'
            ? { failureReason: 'Reported as unpaid by Hubtel' }
            : {}),
        },
      })
    }

    return NextResponse.json({ success: true, status: result.status })
  } catch (err) {
    console.error('MoMo status error:', err)
    return NextResponse.json({ error: 'Failed to check MoMo status' }, { status: 500 })
  }
}
