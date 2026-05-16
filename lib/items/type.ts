export type CatalogItemType = 'INVENTORY' | 'NON_INVENTORY' | 'SERVICE'

const ITEM_TYPE_LABELS: Record<CatalogItemType, string> = {
  INVENTORY: 'Inventory',
  NON_INVENTORY: 'Non-Inventory',
  SERVICE: 'Service',
}

export function normalizeItemType(itemType?: string | null): CatalogItemType {
  if (itemType === 'NON_INVENTORY' || itemType === 'SERVICE') {
    return itemType
  }
  return 'INVENTORY'
}

export function isInventoryItemType(itemType?: string | null): boolean {
  return normalizeItemType(itemType) === 'INVENTORY'
}

export function itemTypeLabel(itemType?: string | null): string {
  return ITEM_TYPE_LABELS[normalizeItemType(itemType)]
}
