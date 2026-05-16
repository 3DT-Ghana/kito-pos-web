import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

/**
 * POST /api/import/customers
 *
 * Bulk import customers with optional opening balances.
 *
 * Body: { rows: Array<{
 *   name: string
 *   phone?: string
 *   balance?: number     // opening balance (amount customer owes), defaults to 0
 * }> }
 *
 * Returns: { imported, skipped, errors }
 */

export async function POST(req: Request) {
  try {
    const { error, tenantId, user, rolePermissions } = await requireTenant()
    if (error) return error!

    const { authorized, error: permError } = requirePermission(
      { role: user!.role, rolePermissions },
      'create_customers'
    )
    if (!authorized) return permError!

    const body = await req.json()
    const rows: Record<string, unknown>[] = body.rows || []

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    if (rows.length > 1000) {
      return NextResponse.json({ error: 'Maximum 1000 rows per import' }, { status: 400 })
    }

    const results = { imported: 0, skipped: 0, errors: [] as string[] }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2

      const name = (String(row.name || '')).trim()
      const phone = (String(row.phone || '')).trim() || null
      const balance = parseFloat(String(row.balance ?? '0'))

      if (!name) { results.errors.push(`Row ${rowNum}: name is required`); results.skipped++; continue }
      if (isNaN(balance) || balance < 0) { results.errors.push(`Row ${rowNum}: invalid balance`); results.skipped++; continue }

      try {
        // Check for duplicate name
        const existing = await prisma.customer.findFirst({
          where: { tenantId: tenantId!, name: { equals: name, mode: 'insensitive' } },
        })
        if (existing) {
          results.errors.push(`Row ${rowNum}: customer "${name}" already exists — skipped`)
          results.skipped++
          continue
        }

        // Check phone uniqueness if provided
        if (phone) {
          const phoneExists = await prisma.customer.findFirst({
            where: { tenantId: tenantId!, phone },
          })
          if (phoneExists) {
            results.errors.push(`Row ${rowNum}: phone "${phone}" already in use — skipped`)
            results.skipped++
            continue
          }
        }

        await prisma.customer.create({
          data: { tenantId: tenantId!, name, phone, balance },
        })
        results.imported++
      } catch (err) {
        results.errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        results.skipped++
      }
    }

    return NextResponse.json(results, { status: 200 })
  } catch (err) {
    console.error('Import customers failed:', err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
