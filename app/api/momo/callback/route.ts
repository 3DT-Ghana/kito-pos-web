import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { createSaleFromInput } from '@/lib/sales/createSale'
import type { BranchAccessContext } from '@/lib/branch/server'
import {
  TENANT_FEATURE_SELECT,
  mergePlanFeatures,
  type TenantFeatureFlags,
} from '@/lib/tenant/features'
import { getTenantPlanFeatureKeys } from '@/lib/tenant/planFeatures'

/**
 * POST /api/momo/callback
 *
 * Receives the final outcome of a MoMo payment from Hubtel, and completes the
 * sale the till was waiting to record.
 *
 * The Receive Money API is asynchronous: the initial response is only ever
 * "0001 — pending", and the real result arrives here up to 30 seconds later.
 * Hubtel makes PrimaryCallbackUrl mandatory for that reason, and treats the
 * status endpoint as a fallback for when no callback arrives within five
 * minutes.
 *
 * This is what makes a payment survive the till. The cashier's browser polls
 * for the same outcome and will usually record the sale first, but if that tab
 * is closed, reloaded, or loses power while the customer is entering their PIN,
 * this endpoint is the only thing standing between an approved payment and a
 * customer who has been charged for a sale nobody recorded.
 *
 * Payload:
 *   { ResponseCode: "0000" | "2001", Message: "success" | "failed",
 *     Data: { ClientReference, TransactionId, ExternalTransactionId, Amount,
 *             Charges, AmountAfterCharges, AmountCharged, OrderId,
 *             PaymentDate, Description } }
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

/** Ghana MSISDN comparison, so 0244… and 233244… count as the same number. */
function samePhone(a: string, b: string): boolean {
  const norm = (s: string) => {
    const d = s.replace(/\D/g, '')
    if (d.startsWith('233')) return d
    if (d.startsWith('0')) return '233' + d.slice(1)
    return d.length === 9 ? '233' + d : d
  }
  return norm(a) === norm(b)
}

export async function POST(req: Request) {
  try {
    const ip = callerIp(req)

    // Two independent checks, because either alone is weak here. The source IP
    // can be spoofed at the header level behind a misconfigured proxy, and a
    // token in a URL leaks into logs. When a token is configured it must match;
    // the IP check always applies.
    const expectedToken = process.env.MOMO_WEBHOOK_TOKEN?.trim()
    if (expectedToken) {
      const supplied = new URL(req.url).searchParams.get('token')
      if (supplied !== expectedToken) {
        console.warn('[momo-callback] Rejected: bad or missing webhook token.')
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
      }
    }

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
        CustomerMsisdn?: string
      }
    }

    const reference = data.Data?.ClientReference
    const succeeded = data.ResponseCode === '0000'

    console.log('[momo-callback]', {
      trusted,
      ip,
      responseCode: data.ResponseCode,
      reference,
      transactionId: data.Data?.TransactionId,
      outcome: succeeded ? 'SUCCESS' : 'FAILED',
    })

    // Rejected before anything is written: an unverified caller must never be
    // able to mark a payment as settled.
    if (!trusted) {
      console.warn(
        `[momo-callback] Rejected: expected ${HUBTEL_CALLBACK_IP}, got ${ip ?? 'unknown'}.`
      )
      return NextResponse.json({ error: 'Unrecognised source' }, { status: 403 })
    }

    if (!reference) {
      console.error('[momo-callback] No ClientReference in payload.')
      // 200: Hubtel retries on non-2xx, and retrying will not add a reference.
      return NextResponse.json({ received: true })
    }

    const txn = await prisma.momoTransaction.findUnique({
      where: { clientReference: reference },
    })

    if (!txn) {
      console.error('[momo-callback] No transaction for reference:', reference)
      return NextResponse.json({ received: true })
    }

    // Hubtel retries until it gets a 2xx, so the same success can arrive more
    // than once. Without this a retry would create a second sale.
    if (txn.status !== 'PENDING') {
      console.log('[momo-callback] Already settled, ignoring:', reference)
      return NextResponse.json({ received: true })
    }

    // A callback naming a different number than the one we charged does not
    // describe our transaction, whatever it claims.
    const callbackPhone = data.Data?.CustomerMsisdn
    if (callbackPhone && !samePhone(callbackPhone, txn.phoneNumber)) {
      console.error('[momo-callback] Phone mismatch for', reference, {
        charged: txn.phoneNumber,
        callback: callbackPhone,
      })
      return NextResponse.json({ error: 'Phone mismatch' }, { status: 400 })
    }

    if (!succeeded) {
      await prisma.momoTransaction.updateMany({
        where: { id: txn.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          failureReason: data.Message || 'Payment failed',
          transactionId: data.Data?.TransactionId ?? undefined,
          completedAt: new Date(),
        },
      })
      return NextResponse.json({ received: true })
    }

    // Claim the transaction before creating the sale. The till is polling for
    // this same outcome, and whichever of us updates the row first owns the
    // sale — the loser's updateMany matches nothing and it stops.
    const claimed = await prisma.momoTransaction.updateMany({
      where: { id: txn.id, status: 'PENDING' },
      data: {
        status: 'SUCCESS',
        transactionId: data.Data?.TransactionId ?? undefined,
        externalTransactionId: data.Data?.ExternalTransactionId ?? undefined,
        amountCharged: data.Data?.AmountCharged ?? undefined,
        completedAt: new Date(),
      },
    })

    if (claimed.count !== 1) {
      console.log('[momo-callback] Lost the race to the till, nothing to do:', reference)
      return NextResponse.json({ received: true })
    }

    // Payment is recorded either way. The sale is a separate step, and only
    // possible when the till sent us its cart — a payment taken outside the POS
    // (a customer paying down a balance) has no sale to create.
    if (!txn.salePayload) {
      return NextResponse.json({ received: true })
    }

    // Normally the till records the sale itself. Reaching here means it did not
    // come back — the tab was closed, or the device lost power.
    if (txn.saleId) {
      return NextResponse.json({ received: true })
    }

    try {
      const payload = JSON.parse(txn.salePayload)

      // The cashier who started the payment is no longer here to authorise it,
      // so the sale is created as them, from what they had already entered.
      const user = await prisma.user.findUnique({
        where: { id: txn.createdById ?? '' },
        select: { id: true, role: true, tenantId: true },
      })

      if (!user || !txn.branchId) {
        console.error('[momo-callback] Cannot rebuild the sale context for', reference)
        return NextResponse.json({ received: true })
      }

      // Rebuilt from the tenant rather than stubbed: createSaleFromInput reads
      // context.features to decide on accounting postings and approval, and
      // context.branchesEnabled to scope the sale. Faking those would post the
      // wrong journals or skip an approval the tenant requires.
      const tenant = await prisma.tenant.findUnique({
        where: { id: txn.tenantId },
        select: TENANT_FEATURE_SELECT,
      })
      if (!tenant) {
        console.error('[momo-callback] Tenant vanished for', reference)
        return NextResponse.json({ received: true })
      }

      const planFeatureKeys = await getTenantPlanFeatureKeys(txn.tenantId)
      const features = mergePlanFeatures(tenant as TenantFeatureFlags, planFeatureKeys)

      const context: BranchAccessContext = {
        tenantId: txn.tenantId,
        user: { id: user.id, role: user.role, tenantId: user.tenantId } as BranchAccessContext['user'],
        rolePermissions: null,
        features,
        branchesEnabled: features.enableBranches,
        branches: [],
        currentBranchId: txn.branchId,
        currentBranch: null,
        assignedBranchId: txn.branchId,
        canViewAllBranches: false,
        isBranchLocked: true,
        allBranchesSelected: false,
      }

      const result = await createSaleFromInput({
        context,
        branchId: txn.branchId,
        body: payload,
      })

      const saleId = result.status === 'created' ? result.sale?.id : result.saleId

      if (saleId) {
        await prisma.momoTransaction.update({
          where: { id: txn.id },
          data: { saleId },
        })
        console.log('[momo-callback] Recovered a sale the till never recorded:', {
          reference,
          saleId,
        })
      }
    } catch (err) {
      // The payment stands regardless — it is recorded as SUCCESS above. A
      // failure here means the sale needs recording by hand, which the pending
      // payments list surfaces.
      console.error('[momo-callback] Payment took but the sale failed for', reference, err)
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[momo-callback] Failed to process callback:', err)
    // A 500 asks Hubtel to retry, which is the right response to our own fault.
    return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 })
  }
}
