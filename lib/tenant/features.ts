import { NextResponse } from 'next/server'

export interface TenantFeatureFlags {
  enableBranches: boolean
  enableQuotations: boolean
  enablePurchaseOrders: boolean
  enableTill: boolean
  enableAccounting: boolean
  enablePayroll: boolean
  requireApproval: boolean
  // extended flags (resolved from plan OR tenant column)
  enablePosTerminal: boolean
  enableExpenses: boolean
  enableBarcodeGenerator: boolean
  enableExpiryTracking: boolean
  enableCreditSales: boolean
  enableSmsNotifications: boolean
}

export const TENANT_FEATURE_SELECT = {
  enableBranches: true,
  enableQuotations: true,
  enablePurchaseOrders: true,
  enableTill: true,
  enableAccounting: true,
  enablePayroll: true,
  requireApproval: true,
  enablePosTerminal: true,
  enableExpenses: true,
  enableBarcodeGenerator: true,
  enableExpiryTracking: true,
  enableCreditSales: true,
  enableSmsNotifications: true,
} as const

const FEATURE_ERRORS: Record<keyof TenantFeatureFlags, string> = {
  enableBranches: 'Branch management is not enabled for this tenant.',
  enableQuotations: 'Quotations module is not enabled for this tenant.',
  enablePurchaseOrders: 'Purchase orders module is not enabled for this tenant.',
  enableTill: 'Till module is not enabled for this tenant.',
  enableAccounting: 'Accounting module is not enabled for this tenant.',
  enablePayroll: 'Payroll module is not enabled for this tenant.',
  requireApproval: 'Approval workflow is not enabled for this tenant.',
  enablePosTerminal: 'POS Terminal module is not enabled for this tenant.',
  enableExpenses: 'Expense tracking is not enabled for this tenant.',
  enableBarcodeGenerator: 'Barcode generator is not enabled for this tenant.',
  enableExpiryTracking: 'Expiry tracking is not enabled for this tenant.',
  enableCreditSales: 'Credit sales are not enabled for this tenant.',
  enableSmsNotifications: 'SMS notifications are not enabled for this tenant.',
}

// Maps FeatureModule.key → TenantFeatureFlags key.
// When a feature module key is assigned to a tenant's plan, the corresponding
// flag is automatically set to true regardless of the tenant.enable* column.
export const FEATURE_KEY_MAP: Record<string, keyof TenantFeatureFlags> = {
  pos:              'enablePosTerminal',
  pos_terminal:     'enablePosTerminal',
  quotations:       'enableQuotations',
  purchase_orders:  'enablePurchaseOrders',
  till:             'enableTill',
  accounting:       'enableAccounting',
  payroll:          'enablePayroll',
  branches:         'enableBranches',
  multi_branch:     'enableBranches',
  expenses:         'enableExpenses',
  expense_tracking: 'enableExpenses',
  barcode:          'enableBarcodeGenerator',
  barcodes:         'enableBarcodeGenerator',
  expiry:           'enableExpiryTracking',
  expiry_tracking:  'enableExpiryTracking',
  credit_sales:     'enableCreditSales',
  sms:              'enableSmsNotifications',
  sms_notifications:'enableSmsNotifications',
  approval:         'requireApproval',
}

export function requireTenantFeature(
  features: TenantFeatureFlags,
  feature: keyof TenantFeatureFlags,
  message?: string
) {
  if (features[feature]) {
    return null
  }

  return NextResponse.json(
    { error: message ?? FEATURE_ERRORS[feature] },
    { status: 403 }
  )
}

/**
 * Merge plan-assigned feature keys into the base tenant flags.
 * planFeatureKeys is an array of FeatureModule.key values assigned to the tenant's plan.
 */
export function mergePlanFeatures(
  base: TenantFeatureFlags,
  planFeatureKeys: string[]
): TenantFeatureFlags {
  const merged = { ...base }
  for (const key of planFeatureKeys) {
    const flag = FEATURE_KEY_MAP[key]
    if (flag) {
      merged[flag] = true
    }
  }
  return merged
}
