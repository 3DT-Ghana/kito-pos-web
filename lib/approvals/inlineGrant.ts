import { createHmac, timingSafeEqual } from 'crypto'

export type ApprovalGrantScope = 'SALE'

export interface ApprovalGrantPayload {
  tenantId: string
  branchId: string | null
  approverId: string
  approverName: string
  scope: ApprovalGrantScope
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
  payload: Omit<ApprovalGrantPayload, 'expiresAt'> & { expiresAt?: number }
) {
  const completePayload: ApprovalGrantPayload = {
    ...payload,
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
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) return null

    return payload
  } catch {
    return null
  }
}
