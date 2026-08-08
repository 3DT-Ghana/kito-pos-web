import { NextResponse } from 'next/server'

/**
 * POST /api/momo/callback
 *
 * Receives the final outcome of a MoMo payment from Hubtel.
 *
 * The Receive Money API is asynchronous: the initial response is only ever
 * "0001 — pending", and the real result arrives here up to 30 seconds later.
 * Hubtel makes PrimaryCallbackURL mandatory for that reason, and treats the
 * status-check endpoint as a fallback for when a callback does not arrive
 * within five minutes.
 *
 * Payload (from the docs):
 *   { ResponseCode: "0000" | "2001", Message: "success" | "failed",
 *     Data: { ClientReference, TransactionId, ExternalTransactionId, Amount,
 *             Charges, AmountAfterCharges, AmountCharged, OrderId,
 *             PaymentDate, Description } }
 *
 * This endpoint currently *records* outcomes rather than completing sales. The
 * POS generates its ClientReference client-side (`POS-<timestamp>`) and never
 * stores it, and the sale row is only written after the customer approves — so
 * there is nothing here to match a callback against yet. Closing that gap needs
 * a MomoTransaction table written at prompt time; until then, logging means no
 * callback is silently lost and Hubtel stops receiving 401s.
 */

// Hubtel's documented callback source. Anyone can POST to a public endpoint,
// and without a signature this is the only thing distinguishing a real
// notification from a forged one — so treat a mismatch as untrusted.
const HUBTEL_CALLBACK_IP = '18.202.122.131'

function callerIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  // The left-most entry is the original client; the rest are proxies.
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return req.headers.get('x-real-ip')
}

export async function POST(req: Request) {
  try {
    const ip = callerIp(req)
    const trusted = ip === HUBTEL_CALLBACK_IP

    const body = await req.json().catch(() => null)
    const data = (body ?? {}) as {
      ResponseCode?: string
      Message?: string
      Data?: {
        ClientReference?: string
        TransactionId?: string
        ExternalTransactionId?: string
        Amount?: number
        AmountCharged?: number
        PaymentDate?: string
      }
    }

    const reference = data.Data?.ClientReference
    const succeeded = data.ResponseCode === '0000'

    // Logged rather than stored: there is no table to write to yet, and losing
    // the record entirely would make a disputed payment impossible to trace.
    console.log('[momo-callback]', {
      trusted,
      ip,
      responseCode: data.ResponseCode,
      message: data.Message,
      reference,
      transactionId: data.Data?.TransactionId,
      externalTransactionId: data.Data?.ExternalTransactionId,
      amount: data.Data?.Amount,
      amountCharged: data.Data?.AmountCharged,
      paymentDate: data.Data?.PaymentDate,
      outcome: succeeded ? 'SUCCESS' : 'FAILED',
    })

    if (!trusted) {
      console.warn(
        `[momo-callback] Rejected: expected ${HUBTEL_CALLBACK_IP}, got ${ip ?? 'unknown'}.`
      )
      return NextResponse.json({ error: 'Unrecognised source' }, { status: 403 })
    }

    // Hubtel retries on a non-2xx, so acknowledge anything we have recorded —
    // including a failed payment, which is a legitimate final outcome.
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[momo-callback] Failed to process callback:', err)
    // A 500 asks Hubtel to retry, which is the right response to our own fault.
    return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 })
  }
}
