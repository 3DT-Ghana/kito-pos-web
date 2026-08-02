import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { createAuditLog, createAuditLogs } from '@/lib/audit/auditLog'

/**
 * POST /api/customers/adjust-balance
 *
 * Single or bulk customer balance adjustment.
 *
 * Body (single):  { customerId: string, balance: number, reason: string }
 * Body (bulk):    { adjustments: Array<{ customerId: string, balance: number, reason: string }> }
 *
 * Sets the balance to the given absolute value (not add/subtract).
 * Requires adjust_balances permission.
 *
 * Writing off a customer debt is a material financial action, so every
 * adjustment records who did it, the before and after values, and a reason —
 * mirroring how stock adjustments already work.
 */

const MIN_REASON_LENGTH = 3

export async function POST(req: Request) {
  try {
    const { error, tenantId, user, rolePermissions } = await requireTenant()
    if (error) return error!

    // Was gated on `update_customers`, which CASHIER and STAFF hold — so any
    // cashier could zero out any customer's debt. `adjust_balances` exists for
    // exactly this and was previously enforced by no route at all.
    const { authorized, error: permError } = requirePermission(
      { role: user!.role, rolePermissions },
      'adjust_balances'
    )
    if (!authorized) return permError!

    const body = await req.json()

    // Detect single vs bulk
    const isBulk = Array.isArray(body.adjustments)
    const adjustments: Array<{ customerId: string; balance: number; reason?: string }> = isBulk
      ? body.adjustments
      : [{ customerId: body.customerId, balance: body.balance, reason: body.reason }]

    if (adjustments.length === 0) {
      return NextResponse.json({ error: 'No adjustments provided' }, { status: 400 })
    }

    if (adjustments.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 adjustments per request' }, { status: 400 })
    }

    if (isBulk) {
      // Validate every row before touching anything, so a bad row cannot leave
      // a half-applied batch with no record of which half.
      const errors: string[] = []
      const resolved: Array<{ customerId: string; balance: number; reason: string }> = []

      for (let i = 0; i < adjustments.length; i++) {
        const { customerId, balance, reason } = adjustments[i]
        const rowNum = i + 1

        if (!customerId) { errors.push(`Row ${rowNum}: customerId required`); continue }
        const bal = parseFloat(String(balance))
        if (isNaN(bal) || bal < 0) { errors.push(`Row ${rowNum}: invalid balance`); continue }
        const trimmedReason = String(reason ?? '').trim()
        if (trimmedReason.length < MIN_REASON_LENGTH) {
          errors.push(`Row ${rowNum}: a reason of at least ${MIN_REASON_LENGTH} characters is required`)
          continue
        }
        resolved.push({ customerId, balance: bal, reason: trimmedReason })
      }

      if (errors.length > 0) {
        return NextResponse.json(
          {
            error: `${errors.length} of ${adjustments.length} rows are invalid. No balances were changed — fix these and submit again.`,
            errors,
          },
          { status: 400 }
        )
      }

      const customers = await prisma.customer.findMany({
        where: { id: { in: resolved.map(r => r.customerId) }, tenantId: tenantId! },
        select: { id: true, name: true, balance: true },
      })
      const customerMap = new Map(customers.map(c => [c.id, c]))

      const missing = resolved.filter(r => !customerMap.has(r.customerId))
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `${missing.length} customer(s) were not found. No balances were changed.` },
          { status: 404 }
        )
      }

      // One transaction so the batch is all-or-nothing
      await prisma.$transaction(
        resolved.map(r =>
          prisma.customer.updateMany({
            where: { id: r.customerId, tenantId: tenantId! },
            data: { balance: r.balance },
          })
        )
      )

      await createAuditLogs(
        resolved.map(r => {
          const before = customerMap.get(r.customerId)!
          return {
            tenantId: tenantId!,
            userId: user!.id,
            action: 'UPDATE' as const,
            entity: 'CustomerBalance',
            entityId: r.customerId,
            details: {
              customerName: before.name,
              previousBalance: before.balance,
              newBalance: r.balance,
              change: r.balance - before.balance,
              reason: r.reason,
            },
          }
        })
      )

      return NextResponse.json({ updated: resolved.length, skipped: 0, errors: [] })
    }

    // Single mode — return the updated customer
    const { customerId, balance, reason } = adjustments[0]

    if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })
    const bal = parseFloat(String(balance))
    if (isNaN(bal) || bal < 0) {
      return NextResponse.json({ error: 'balance must be a non-negative number' }, { status: 400 })
    }
    const trimmedReason = String(reason ?? '').trim()
    if (trimmedReason.length < MIN_REASON_LENGTH) {
      return NextResponse.json(
        { error: `Please give a reason for this adjustment (at least ${MIN_REASON_LENGTH} characters).` },
        { status: 400 }
      )
    }

    const existing = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: tenantId! },
    })
    if (!existing) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    // Scoped by tenant at write time rather than trusting the read above
    const result = await prisma.customer.updateMany({
      where: { id: customerId, tenantId: tenantId! },
      data: { balance: bal },
    })
    if (result.count !== 1) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    await createAuditLog({
      tenantId: tenantId!,
      userId: user!.id,
      action: 'UPDATE',
      entity: 'CustomerBalance',
      entityId: customerId,
      details: {
        customerName: existing.name,
        previousBalance: existing.balance,
        newBalance: bal,
        change: bal - existing.balance,
        reason: trimmedReason,
      },
    })

    const updated = await prisma.customer.findFirst({ where: { id: customerId } })
    return NextResponse.json({ ...updated, previousBalance: existing.balance })
  } catch (err) {
    console.error('Balance adjustment failed:', err)
    return NextResponse.json({ error: 'Adjustment failed' }, { status: 500 })
  }
}
