export const DEFAULT_REORDER_LEVEL = 10

export function normalizeReorderLevel(reorderLevel: number | null | undefined) {
  const value = Number(reorderLevel)
  if (!Number.isFinite(value)) return DEFAULT_REORDER_LEVEL
  return Math.max(0, Math.trunc(value))
}

export function isOutOfStock(quantity: number) {
  return quantity <= 0
}

export function isLowStock(quantity: number, reorderLevel: number | null | undefined) {
  return quantity > 0 && quantity <= normalizeReorderLevel(reorderLevel)
}

export function getStockAlertState(quantity: number, reorderLevel: number | null | undefined) {
  if (isOutOfStock(quantity)) return 'out'
  if (isLowStock(quantity, reorderLevel)) return 'low'
  return 'ok'
}
