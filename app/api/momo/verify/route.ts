import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { prisma } from '@/lib/db/prisma'
import { verifyMomoNumber, isMomoChannel, type MomoVerifyResult } from '@/lib/momo/hubtelVerify'
import { normalisePhone } from '@/lib/momo/hubtelCollect'

/**
 * POST /api/momo/verify
 *
 * Confirms a number is registered for mobile money and returns the wallet name,
 * so the cashier can check it before a payment prompt is sent.
 *
 * Body: { phoneNumber: string, channel: 'mtn-gh' | 'vodafone-gh' | 'tigo-gh' }
 *
 * Server-side only: the Hubtel credentials must not reach the browser, and
 * Hubtel whitelists this server's IP rather than each till's.
 */

// This is a name lookup against arbitrary numbers. Uncapped it is an
// enumeration tool, so it is limited per user in the same way PIN verification
// is — see app/api/approvals/pin-verify/route.ts.
const MAX_LOOKUPS = 30
const WINDOW_MS = 5 * 60 * 1000
const lookups = new Map<string, { count: number; firstAt: number }>()

// Verification is billed per call, and retyping one digit should not pay twice.
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; result: MomoVerifyResult }>()

function rateLimited(userId: string): number {
  const now = Date.now()
  const entry = lookups.get(userId)
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    lookups.set(userId, { count: 1, firstAt: now })
    return 0
  }
  entry.count++
  if (lookups.size > 500) {
    for (const [k, v] of lookups) {
      if (now - v.firstAt > WINDOW_MS) lookups.delete(k)
    }
  }
  return entry.count > MAX_LOOKUPS
    ? Math.ceil((WINDOW_MS - (now - entry.firstAt)) / 1000)
    : 0
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const body = await req.json()
    const phoneNumber = String(body.phoneNumber ?? '').trim()
    const channel = body.channel

    if (!phoneNumber || !channel) {
      return NextResponse.json(
        { error: 'phoneNumber and channel are required' },
        { status: 400 }
      )
    }
    if (!isMomoChannel(channel)) {
      return NextResponse.json({ error: 'Unknown mobile money network' }, { status: 400 })
    }

    const phone = normalisePhone(phoneNumber)
    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'That is not a valid Ghana phone number.' },
        { status: 200 }
      )
    }

    const retryAfter = rateLimited(context!.user.id)
    if (retryAfter > 0) {
      return NextResponse.json(
        { error: `Too many lookups. Try again in ${retryAfter}s.` },
        { status: 429 }
      )
    }

    const cacheKey = `${context!.tenantId}:${channel}:${phone}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json({ ...hit.result, cached: true })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: {
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelCollectionAccount: true,
      },
    })

    if (
      !tenant?.hubtelClientId ||
      !tenant?.hubtelClientSecret ||
      !tenant?.hubtelCollectionAccount
    ) {
      // 200, not an error status: the caller treats this as "cannot verify" and
      // carries on. A missing setting must not read as a failed sale.
      return NextResponse.json({
        success: false,
        unconfigured: true,
        error:
          'Number verification is not set up. Add the Hubtel credentials and Collection Account Number in Settings → SMS.',
      })
    }

    const result = await verifyMomoNumber(
      {
        clientId: tenant.hubtelClientId,
        clientSecret: tenant.hubtelClientSecret,
        collectionAccount: tenant.hubtelCollectionAccount,
      },
      channel,
      phone
    )

    // Only successful lookups are cached — a transient outage should be retried,
    // not remembered for five minutes.
    if (result.success) {
      cache.set(cacheKey, { at: Date.now(), result })
      if (cache.size > 1000) {
        const cutoff = Date.now() - CACHE_TTL_MS
        for (const [k, v] of cache) if (v.at < cutoff) cache.delete(k)
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('MoMo verify error:', err)
    // Still 200: the modal falls through to the unverified path rather than
    // showing the cashier an error they cannot act on mid-sale.
    return NextResponse.json({ success: false, error: 'Verification failed.' })
  }
}
