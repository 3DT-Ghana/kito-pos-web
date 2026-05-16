import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

/**
 * POST /api/customers/adjust-balance
 *
 * Single or bulk customer balance adjustment.
 *
 * Body (single):  { customerId: string, balance: number, reason?: string }
 * Body (bulk):    { adjustments: Array<{ customerId: string, balance: number, reason?: string }> }
 *
 * Sets the balance to the given absolute value (not add/subtract).
 * Requires update_customers permission.
 */

export async function POST(req: Request) {
  try {
    const { error, tenantId, user, rolePermissions } = await requireTenant()
    if (error) return error!

    const { authorized, error: permError } = requirePermission(
      { role: user!.role, rolePermissions },
      'update_customers'
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
      // Bulk mode — return results array
      const results = { updated: 0, skipped: 0, errors: [] as string[] }

      for (let i = 0; i < adjustments.length; i++) {
        const { customerId, balance } = adjustments[i]
        const rowNum = i + 1

        if (!customerId) { results.errors.push(`Row ${rowNum}: customerId required`); results.skipped++; continue }
        const bal = parseFloat(String(balance))
        if (isNaN(bal) || bal < 0) { results.errors.push(`Row ${rowNum}: invalid balance`); results.skipped++; continue }

        try {
          const existing = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tenantId! } })
          if (!existing) { results.errors.push(`Row ${rowNum}: customer not found`); results.skipped++; continue }

          await prisma.customer.update({ where: { id: customerId }, data: { balance: bal } })
          results.updated++
        } catch (err) {
          results.errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : 'error'}`)
          results.skipped++
        }
      }

      return NextResponse.json(results)
    } else {
      // Single mode — return the updated customer
      const { customerId, balance } = adjustments[0]

      if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })
      const bal = parseFloat(String(balance))
      if (isNaN(bal) || bal < 0) return NextResponse.json({ error: 'balance must be a non-negative number' }, { status: 400 })

      const existing = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tenantId! } })
      if (!existing) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

      const updated = await prisma.customer.update({
        where: { id: customerId },
        data: { balance: bal },
      })

      return NextResponse.json({ ...updated, previousBalance: existing.balance })
    }
  } catch (err) {
    console.error('Balance adjustment failed:', err)
    return NextResponse.json({ error: 'Adjustment failed' }, { status: 500 })
  }
}
