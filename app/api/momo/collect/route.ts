import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { prisma } from '@/lib/db/prisma'
import { sendMomoCollect } from '@/lib/momo/hubtelCollect'
import { isMomoChannel } from '@/lib/momo/hubtelVerify'

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
    const { amount, phoneNumber, description, clientReference, channel, customerName, salePayload } =
      body

    if (!amount || !phoneNumber || !clientReference) {
      return NextResponse.json(
        { error: 'amount, phoneNumber, and clientReference are required' },
        { status: 400 }
      )
    }
    // Hubtel requires the network with every payment — it cannot be inferred
    // from the number, since a ported line keeps its original prefix.
    if (!isMomoChannel(channel)) {
      return NextResponse.json(
        { error: 'Choose the customer\'s mobile money network before charging.' },
        { status: 400 }
      )
    }

    // Load tenant Hubtel credentials
    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: {
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelCallbackUrl: true,
        hubtelCollectionAccount: true,
        name: true,
      },
    })

    if (!tenant?.hubtelClientId || !tenant?.hubtelClientSecret) {
      return NextResponse.json(
        { error: 'MoMo collection is not configured. Add Hubtel credentials in Settings → SMS.' },
        { status: 422 }
      )
    }

    // Recorded before the prompt goes out, not after. If the till loses power
    // or closes its tab while the customer is entering their PIN, this row and
    // Hubtel's callback are the only things that can still turn an approved
    // payment into a sale.
    await prisma.momoTransaction.create({
      data: {
        tenantId: context!.tenantId,
        branchId: context!.currentBranchId ?? null,
        clientReference: String(clientReference),
        phoneNumber: String(phoneNumber),
        channel,
        amount: parseFloat(String(amount)),
        salePayload: salePayload ? JSON.stringify(salePayload) : null,
        createdById: context!.user.id,
      },
    })

    const result = await sendMomoCollect(
      {
        clientId: tenant.hubtelClientId,
        clientSecret: tenant.hubtelClientSecret,
        callbackUrl: tenant.hubtelCallbackUrl,
        collectionAccount: tenant.hubtelCollectionAccount ?? '',
      },
      {
        amount: parseFloat(String(amount)),
        phoneNumber: String(phoneNumber),
        channel,
        customerName: customerName ? String(customerName) : undefined,
        description: description || `Payment to ${tenant.name}`,
        clientReference: String(clientReference),
      }
    )

    if (!result.success) {
      console.error('[momo-collect] Hubtel refused the payment request:', {
        reference: clientReference,
        channel,
        error: result.error,
      })
      // The prompt never reached the customer, so this reference is dead.
      // Closing it keeps a refused attempt from sitting in the pending list.
      await prisma.momoTransaction.updateMany({
        where: { clientReference: String(clientReference), status: 'PENDING' },
        data: { status: 'FAILED', failureReason: result.error, completedAt: new Date() },
      })
      // 200, deliberately. A 5xx here is indistinguishable in the browser from
      // the proxy itself failing, and some proxies replace a 5xx body with
      // their own HTML error page — which discards Hubtel's message and leaves
      // the cashier with "Unexpected token '<'" instead of a reason.
      // The caller reads `success`, not the status code.
      return NextResponse.json({ success: false, error: result.error })
    }

    await prisma.momoTransaction.updateMany({
      where: { clientReference: String(clientReference), status: 'PENDING' },
      data: {
        transactionId: result.transactionId ?? null,
        // 0000 means Hubtel settled it outright — no callback is coming, so
        // leaving it PENDING would strand a paid transaction.
        ...(result.status === 'success'
          ? { status: 'SUCCESS' as const, completedAt: new Date() }
          : {}),
      },
    })

    return NextResponse.json({
      success: true,
      transactionId: result.transactionId,
      status: result.status,
    })
  } catch (err) {
    console.error('MoMo collect error:', err)
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send MoMo request',
    })
  }
}
