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
 *   category?: string          // category name (created if not exists); when
 *                              // omitted, falls back to the manufacturer name
 *                              // so the POS still has something to group by
 *   costPrice: number
 *   sellingPrice: number
 *   quantity?: number          // opening stock, defaults to 0
 *   retailPrice?: number       // ignored unless the tenant enables that tier
 *   wholesalePrice?: number
 *   promoPrice?: number
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

    // Price tiers are only written for the tiers this business actually uses,
    // so a spreadsheet carrying a wholesale column into a retail-only shop
    // cannot quietly seed prices that no screen will ever show or maintain.
    const tenantPricing = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { enableRetailPrice: true, enableWholesalePrice: true, enablePromoPrice: true },
    })
    const priceTiers = {
      retail: tenantPricing?.enableRetailPrice ?? false,
      wholesale: tenantPricing?.enableWholesalePrice ?? false,
      promo: tenantPricing?.enablePromoPrice ?? false,
    }
    const ignoredTierCols = new Set<string>()

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

    // Categories drive the POS tab bar. They are tenant-scoped (unlike items,
    // which are per branch), so a category created by one branch's import is
    // reused by the next rather than duplicated.
    const catCache: Record<string, string> = {}
    let catSortOrder = await prisma.category.count({ where: { tenantId: context!.tenantId } })
    const resolveCategory = async (rawName: string): Promise<string> => {
      const key = rawName.toLowerCase()
      if (catCache[key]) return catCache[key]
      let cat = await prisma.category.findFirst({
        where: { tenantId: context!.tenantId, name: { equals: rawName, mode: 'insensitive' } },
      })
      if (!cat) {
        cat = await prisma.category.create({
          data: { tenantId: context!.tenantId, name: rawName, sortOrder: catSortOrder++ },
        })
      }
      catCache[key] = cat.id
      return cat.id
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // 1-indexed + header row

      const name         = String(row.name || '').trim()
      const mfrName      = String(row.manufacturer || '').trim()
      // Shops that sell by brand (phone stores, for one) use the same value for
      // both: the brand is how staff browse the POS. Defaulting category to the
      // manufacturer means such a sheet needs only one column, while a shop
      // that groups differently can still supply its own category column.
      const catName      = String(row.category || '').trim() || mfrName
      const costPrice    = parseFloat(String(row.costprice ?? row.costPrice ?? ''))
      const sellingPrice = parseFloat(String(row.sellingprice ?? row.sellingPrice ?? ''))
      const quantity     = parseFloat(String(row.quantity ?? '0'))
      const barcode      = String(row.barcode || '').trim() || null
      const reorderLevel = parseInt(String(row.reorderlevel ?? row.reorderLevel ?? '10'), 10)

      // Optional price tiers. A blank cell means "no tier price", which is a
      // valid state (the item falls back to sellingPrice) — only a non-empty
      // unparseable value is an error.
      const readTier = (raw: unknown, colName: string, enabled: boolean) => {
        const text = String(raw ?? '').trim()
        if (!text) return { ok: true as const, value: null }
        if (!enabled) { ignoredTierCols.add(colName); return { ok: true as const, value: null } }
        const parsedValue = parseFloat(text)
        if (isNaN(parsedValue) || parsedValue < 0) {
          return { ok: false as const, error: `invalid ${colName}` }
        }
        return { ok: true as const, value: parsedValue }
      }

      const retail    = readTier(row.retailprice ?? row.retailPrice, 'retailPrice', priceTiers.retail)
      const wholesale = readTier(row.wholesaleprice ?? row.wholesalePrice, 'wholesalePrice', priceTiers.wholesale)
      const promo     = readTier(row.promoprice ?? row.promoPrice, 'promoPrice', priceTiers.promo)

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

      const badTier = [retail, wholesale, promo].find(t => !t.ok)
      if (badTier && !badTier.ok) { results.errors.push(`Row ${rowNum}: ${badTier.error}`); results.skipped++; continue }

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

        // Left null when the row named no category and no manufacturer to fall
        // back on — better an ungrouped item than a category called "General".
        const categoryId = catName ? await resolveCategory(catName) : null

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
            ...(categoryId ? { categoryId } : {}),
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
            ...(retail.ok && retail.value !== null ? { retailPrice: retail.value } : {}),
            ...(wholesale.ok && wholesale.value !== null ? { wholesalePrice: wholesale.value } : {}),
            ...(promo.ok && promo.value !== null ? { promoPrice: promo.value } : {}),
          },
        })
        results.imported++
      } catch (err) {
        results.errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        results.skipped++
      }
    }

    // Silently dropping a whole price column would look like data loss, so say
    // it plainly and point at the setting that would have accepted it.
    if (ignoredTierCols.size > 0) {
      results.errors.push(
        `Ignored ${[...ignoredTierCols].join(', ')} — the matching price level is turned off in Settings → Features. Enable it and re-import to apply those prices.`
      )
    }

    return NextResponse.json(results, { status: 200 })
  } catch (err) {
    console.error('Import items failed:', err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
