import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'

/**
 * POST /api/import/items
 *
 * Bulk import items (with auto-create manufacturers).
 *
 * Body: { rows: Array<{
 *   name: string
 *   manufacturer: string       // manufacturer name (created if not exists)
 *   costPrice: number
 *   sellingPrice: number
 *   quantity?: number          // opening stock, defaults to 0
 * }> }
 *
 * Returns: { imported, skipped, errors }
 */

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'create_items')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before importing inventory.'
    )
    if (branchError) return branchError

    const body = await req.json()
    const rows: Record<string, unknown>[] = body.rows || []

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    if (rows.length > 1000) {
      return NextResponse.json({ error: 'Maximum 1000 rows per import' }, { status: 400 })
    }

    const results = { imported: 0, skipped: 0, errors: [] as string[] }

    // Cache manufacturer lookups to avoid N+1 queries
    const mfrCache: Record<string, string> = {}

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // 1-indexed + header row

      const name = String(row.name || '').trim()
      const mfrName = String(row.manufacturer || '').trim()
      const costPrice = parseFloat(String(row.costprice ?? row.costPrice))
      const sellingPrice = parseFloat(String(row.sellingprice ?? row.sellingPrice))
      const quantity = parseInt(String(row.quantity ?? '0'), 10)

      // Validate row
      if (!name) { results.errors.push(`Row ${rowNum}: name is required`); results.skipped++; continue }
      if (!mfrName) { results.errors.push(`Row ${rowNum}: manufacturer is required`); results.skipped++; continue }
      if (isNaN(costPrice) || costPrice < 0) { results.errors.push(`Row ${rowNum}: invalid costPrice`); results.skipped++; continue }
      if (isNaN(sellingPrice) || sellingPrice < 0) { results.errors.push(`Row ${rowNum}: invalid sellingPrice`); results.skipped++; continue }
      if (isNaN(quantity) || quantity < 0) { results.errors.push(`Row ${rowNum}: invalid quantity`); results.skipped++; continue }

      try {
        // Resolve manufacturer (create if not exists)
        const mfrKey = mfrName.toLowerCase()
        if (!mfrCache[mfrKey]) {
          let mfr = await prisma.manufacturer.findFirst({
            where: { tenantId: context!.tenantId, name: { equals: mfrName, mode: 'insensitive' } },
          })
          if (!mfr) {
            mfr = await prisma.manufacturer.create({
              data: { tenantId: context!.tenantId, name: mfrName },
            })
          }
          mfrCache[mfrKey] = mfr.id
        }
        const manufacturerId = mfrCache[mfrKey]

        // Skip duplicate item names within the same manufacturer
        const existing = await prisma.item.findFirst({
          where: {
            tenantId: context!.tenantId,
            manufacturerId,
            ...(context!.branchesEnabled ? { branchId } : {}),
            name: { equals: name, mode: 'insensitive' },
          },
        })
        if (existing) {
          results.errors.push(`Row ${rowNum}: item "${name}" already exists for this manufacturer — skipped`)
          results.skipped++
          continue
        }

        await prisma.item.create({
          data: {
            tenantId: context!.tenantId,
            ...(context!.branchesEnabled ? { branchId } : {}),
            manufacturerId,
            name,
            costPrice,
            sellingPrice,
            quantity,
          },
        })
        results.imported++
      } catch (err) {
        results.errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        results.skipped++
      }
    }

    return NextResponse.json(results, { status: 200 })
  } catch (err) {
    console.error('Import items failed:', err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
