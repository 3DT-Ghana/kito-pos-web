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

    // Pre-fetch or create a default "General" manufacturer for rows without one
    let defaultMfrId: string | null = null
    const getDefaultMfr = async () => {
      if (defaultMfrId) return defaultMfrId
      let mfr = await prisma.manufacturer.findFirst({
        where: { tenantId: context!.tenantId, name: { equals: 'General', mode: 'insensitive' } },
      })
      if (!mfr) {
        mfr = await prisma.manufacturer.create({
          data: { tenantId: context!.tenantId, name: 'General' },
        })
      }
      defaultMfrId = mfr.id
      return mfr.id
    }

    // Cache manufacturer lookups to avoid N+1 queries
    const mfrCache: Record<string, string> = {}

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // 1-indexed + header row

      const name         = String(row.name || '').trim()
      const mfrName      = String(row.manufacturer || '').trim()
      const costPrice    = parseFloat(String(row.costprice ?? row.costPrice ?? ''))
      const sellingPrice = parseFloat(String(row.sellingprice ?? row.sellingPrice ?? ''))
      const quantity     = parseFloat(String(row.quantity ?? '0'))
      const barcode      = String(row.barcode || '').trim() || null
      const reorderLevel = parseInt(String(row.reorderlevel ?? row.reorderLevel ?? '10'), 10)

      // Parse itemType — accept case-insensitive variations
      const rawType = String(row.itemtype ?? row.itemType ?? row.type ?? 'INVENTORY').trim().toUpperCase()
      const itemType =
        rawType === 'SERVICE'                                      ? 'SERVICE'
        : rawType === 'NON_INVENTORY' || rawType === 'NONINVENTORY' ? 'NON_INVENTORY'
        : 'INVENTORY'

      // Validate required fields
      if (!name) { results.errors.push(`Row ${rowNum}: name is required`); results.skipped++; continue }
      if (isNaN(costPrice) || costPrice < 0) { results.errors.push(`Row ${rowNum}: invalid costPrice`); results.skipped++; continue }
      if (isNaN(sellingPrice) || sellingPrice < 0) { results.errors.push(`Row ${rowNum}: invalid sellingPrice`); results.skipped++; continue }
      // quantity only relevant for INVENTORY items
      if (itemType === 'INVENTORY' && (isNaN(quantity) || quantity < 0)) { results.errors.push(`Row ${rowNum}: invalid quantity`); results.skipped++; continue }

      try {
        // Resolve manufacturer — fall back to "General" if not provided
        let manufacturerId: string
        if (mfrName) {
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
          manufacturerId = mfrCache[mfrKey]
        } else {
          manufacturerId = await getDefaultMfr()
        }

        // Skip if exact name already exists in this branch/tenant
        const existing = await prisma.item.findFirst({
          where: {
            tenantId: context!.tenantId,
            ...(context!.branchesEnabled ? { branchId } : {}),
            name: { equals: name, mode: 'insensitive' },
          },
        })
        if (existing) {
          results.errors.push(`Row ${rowNum}: item "${name}" already exists — skipped`)
          results.skipped++
          continue
        }

        // Barcode uniqueness is per branch, matching the name check above and
        // the fact that each branch holds its own stock row for a product.
        // Tenant-wide, Branch B could not import an item that Branch A already
        // stocked — even though both legitimately sell it.
        if (barcode) {
          const barcodeExists = await prisma.item.findFirst({
            where: {
              tenantId: context!.tenantId,
              ...(context!.branchesEnabled ? { branchId } : {}),
              barcode,
            },
          })
          if (barcodeExists) {
            results.errors.push(`Row ${rowNum}: barcode "${barcode}" already used in this branch — skipped`)
            results.skipped++
            continue
          }
        }

        await prisma.item.create({
          data: {
            tenantId: context!.tenantId,
            ...(context!.branchesEnabled ? { branchId } : {}),
            manufacturerId,
            name,
            costPrice,
            sellingPrice,
            itemType: itemType as 'INVENTORY' | 'NON_INVENTORY' | 'SERVICE',
            // Only set stock fields for inventory items
            ...(itemType === 'INVENTORY' ? {
              quantity: isNaN(quantity) ? 0 : quantity,
              reorderLevel: isNaN(reorderLevel) ? 10 : reorderLevel,
            } : {
              quantity: 0,
              reorderLevel: 0,
            }),
            ...(barcode ? { barcode } : {}),
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
