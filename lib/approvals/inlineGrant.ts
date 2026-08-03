import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import type { PrismaClient } from '@prisma/client'

export type ApprovalGrantScope = 'SALE'

export interface ApprovalGrantPayload {
  tenantId: string
  branchId: string | null
  approverId: string
  approverName: string
  scope: ApprovalGrantScope
  /**
   * The sale this grant authorises.
   *
   * Without it the grant is a bearer token for *any* sale in the branch: a
   * cashier could capture the token returned by the PIN prompt for a small
   * discount and replay it against every other pending sale, including a large
   * credit sale, until it expired.
   *
   * Null is only valid for a grant minted before a sale exists (the POS create
   * path, where the sale id is not known until after the grant is used).
   */
  saleId: string | null
  /** Unique id, recorded on redemption so a grant cannot be replayed. */
  jti: string
  expiresAt: number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000

function getGrantSecret() {
  return (
    process.env.APPROVAL_GRANT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    'local-approval-grant-secret'
  )
}

function signPayload(serializedPayload: string) {
  return createHmac('sha256', getGrantSecret())
    .update(serializedPayload)
    .digest('base64url')
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function createApprovalGrant(
  payload: Omit<ApprovalGrantPayload, 'expiresAt' | 'jti'> & {
    expiresAt?: number
    jti?: string
  }
) {
  const completePayload: ApprovalGrantPayload = {
    ...payload,
    jti: payload.jti ?? randomUUID(),
    expiresAt: payload.expiresAt ?? Date.now() + DEFAULT_TTL_MS,
  }
  const serializedPayload = JSON.stringify(completePayload)
  const encodedPayload = Buffer.from(serializedPayload, 'utf8').toString('base64url')
  const signature = signPayload(serializedPayload)

  return `${encodedPayload}.${signature}`
}

export function verifyApprovalGrant(
  grant: string,
  expected: {
    tenantId: string
    branchId: string | null
    scope: ApprovalGrantScope
    /**
     * When supplied, the grant must have been minted for this exact sale. Omit
     * only on the create path, where the sale does not exist yet.
     */
    saleId?: string
  }
) {
  if (!grant || typeof grant !== 'string') return null

  const [encodedPayload, signature] = grant.split('.')
  if (!encodedPayload || !signature) return null

  try {
    const serializedPayload = Buffer.from(encodedPayload, 'base64url').toString('utf8')
    const expectedSignature = signPayload(serializedPayload)
    if (!safeCompare(signature, expectedSignature)) return null

    const payload = JSON.parse(serializedPayload) as ApprovalGrantPayload
    if (payload.scope !== expected.scope) return null
    if (payload.tenantId !== expected.tenantId) return null
    if ((payload.branchId ?? null) !== (expected.branchId ?? null)) return null
    if (!payload.approverId || !payload.approverName) return null
    if (!payload.jti) return null
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) return null

    // Bind the grant to its sale. A grant minted for one sale must not approve
    // another, and a sale-bound grant must not be used on the create path.
    if (expected.saleId !== undefined) {
      if (payload.saleId !== expected.saleId) return null
    } else if (payload.saleId !== null) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

/**
 * Redeem a grant exactly once.
 *
 * Recording the jti behind a unique constraint means a captured token cannot be
 * replayed — the second attempt hits the constraint and is rejected. Must run
 * inside the same transaction as the approval it authorises, so a rolled-back
 * approval also releases the grant.
 *
 * Returns false when the grant has already been redeemed.
 */
export async function consumeApprovalGrant(
  tx: Pick<PrismaClient, 'consumedApprovalGrant'>,
  payload: ApprovalGrantPayload,
  saleId: string | null
): Promise<boolean> {
  try {
    await tx.consumedApprovalGrant.create({
      data: {
        tenantId: payload.tenantId,
        jti: payload.jti,
        saleId,
        approverId: payload.approverId,
      },
    })
    return true
  } catch (err) {
    // P2002 = the jti is already recorded, i.e. this grant was already used
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      return false
    }
    throw err
  }
}
