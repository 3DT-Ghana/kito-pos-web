import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { prisma } from '@/lib/db/prisma'
import { getMomoStatus } from '@/lib/momo/hubtelCollect'

/**
 * GET /api/momo/status?transactionId=xxx
 * Poll the status of a Hubtel MoMo collect transaction.
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId is required' }, { status: 400 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { hubtelClientId: true, hubtelClientSecret: true },
    })

    if (!tenant?.hubtelClientId || !tenant?.hubtelClientSecret) {
      return NextResponse.json({ error: 'Hubtel not configured' }, { status: 422 })
    }

    const result = await getMomoStatus(
      { clientId: tenant.hubtelClientId, clientSecret: tenant.hubtelClientSecret },
      transactionId
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
