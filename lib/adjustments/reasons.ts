/**
 * Industry-standard stock adjustment reason categories.
 * Each category covers a specific operational scenario so audit logs are
 * queryable and meaningful rather than free-text noise.
 */

export interface AdjustmentReason {
  key: string
  label: string
  icon: string
  types: ('INCREASE' | 'DECREASE' | 'both')[]
  placeholder: string
}

export const ADJUSTMENT_REASONS: AdjustmentReason[] = [
  // ── Increases ───────────────────────────────────────────────────────────────
  {
    key: 'restock',
    label: 'Restock / Delivery',
    icon: '📦',
    types: ['INCREASE'],
    placeholder: 'e.g. Received delivery from supplier, invoice #...',
  },
  {
    key: 'found',
    label: 'Stock Found',
    icon: '🔍',
    types: ['INCREASE'],
    placeholder: 'e.g. Items found in back store, previously unrecorded...',
  },
  {
    key: 'return_customer',
    label: 'Customer Return',
    icon: '↩️',
    types: ['INCREASE'],
    placeholder: 'e.g. Customer returned 3 units, resaleable condition...',
  },
  {
    key: 'production',
    label: 'Production / Assembly',
    icon: '🏭',
    types: ['INCREASE'],
    placeholder: 'e.g. Produced 50 units in-house, batch #...',
  },
  // ── Decreases ───────────────────────────────────────────────────────────────
  {
    key: 'damage',
    label: 'Damage / Spoilage',
    icon: '💔',
    types: ['DECREASE'],
    placeholder: 'e.g. 5 units damaged during storage, water damage...',
  },
  {
    key: 'expired',
    label: 'Expired / Unsaleable',
    icon: '🗓️',
    types: ['DECREASE'],
    placeholder: 'e.g. Expired on 2025-05-01, disposed per policy...',
  },
  {
    key: 'theft',
    label: 'Theft / Loss',
    icon: '🚨',
    types: ['DECREASE'],
    placeholder: 'e.g. Suspected shoplifting, missing after stock count...',
  },
  {
    key: 'return_supplier',
    label: 'Return to Supplier',
    icon: '🔄',
    types: ['DECREASE'],
    placeholder: 'e.g. Returned 10 defective units to supplier, RMA #...',
  },
  {
    key: 'internal_use',
    label: 'Internal Use / Sample',
    icon: '🏢',
    types: ['DECREASE'],
    placeholder: 'e.g. Used for display, staff sample, office use...',
  },
  // ── Both ────────────────────────────────────────────────────────────────────
  {
    key: 'stocktake',
    label: 'Stock Count / Stocktake',
    icon: '📋',
    types: ['both'],
    placeholder: 'e.g. Physical count on 2025-05-10 found discrepancy...',
  },
  {
    key: 'correction',
    label: 'Data Correction',
    icon: '✏️',
    types: ['both'],
    placeholder: 'e.g. Correcting entry error from previous transaction...',
  },
  {
    key: 'transfer',
    label: 'Branch Transfer',
    icon: '🏪',
    types: ['both'],
    placeholder: 'e.g. Transferred to/from Main Branch...',
  },
  {
    key: 'other',
    label: 'Other',
    icon: '📝',
    types: ['both'],
    placeholder: 'Describe the reason for this adjustment...',
  },
]

export function getReasonsForType(type: 'INCREASE' | 'DECREASE'): AdjustmentReason[] {
  return ADJUSTMENT_REASONS.filter(r => r.types.includes(type) || r.types.includes('both'))
}

export function getReasonByKey(key: string): AdjustmentReason | undefined {
  return ADJUSTMENT_REASONS.find(r => r.key === key)
}

export const REASON_LABEL: Record<string, string> = Object.fromEntries(
  ADJUSTMENT_REASONS.map(r => [r.key, `${r.icon} ${r.label}`])
)
