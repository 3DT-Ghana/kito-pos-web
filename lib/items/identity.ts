/**
 * Product identity across branches.
 *
 * Items are stored per branch — `Item.branchId` sits on the row next to
 * quantity and prices — so the same product sold in three branches is three
 * separate rows. Nothing in the schema ties them together; "the same product"
 * is a naming convention.
 *
 * This key is that convention made explicit. It was already in use for
 * cross-branch stock transfers (`normalizeTransferKey`), which is why it is
 * scoped by manufacturer and unit as well as name: two branches selling
 * "A17 128" from different manufacturers are not the same product, and a
 * "carton" is not a "piece".
 */

/**
 * Canonical key for a product, stable across branches.
 *
 * Case and surrounding whitespace are ignored, so `SPARK 50`, `spark 50` and
 * `SPARK 50 ` collapse to one key — the exact drift that silently splits a
 * product into two in company-wide reports.
 */
export function productKey(
  itemName: string,
  manufacturerId: string,
  unitName?: string | null
) {
  return `${manufacturerId}::${normalizeItemName(itemName)}::${(unitName ?? '').trim().toLowerCase()}`
}

/**
 * Comparison form of an item name: trimmed, lowercased, and with internal runs
 * of whitespace collapsed. `A17  128 ROM` and `A17 128 ROM` are one product,
 * and imported names like `it5606 ` do not become a separate SKU.
 */
export function normalizeItemName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Storage form of an item name. Same whitespace tidying as the comparison
 * form, but the operator's capitalisation is preserved — receipts and reports
 * should read "SPARK 50", not "spark 50".
 */
export function cleanItemName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}
