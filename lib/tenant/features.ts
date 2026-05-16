import { NextResponse } from 'next/server'

export interface TenantFeatureFlags {
  enableBranches: boolean
  enableQuotations: boolean
  enablePurchaseOrders: boolean
  enableTill: boolean
  enableAccounting: boolean
  enablePayroll: boolean
  requireApproval: boolean
}

export const TENANT_FEATURE_SELECT = {
  enableBranches: true,
  enableQuotations: true,
  enablePurchaseOrders: true,
  enableTill: true,
  enableAccounting: true,
  enablePayroll: true,
  requireApproval: true,
} as const

const FEATURE_ERRORS: Record<keyof TenantFeatureFlags, string> = {
  enableBranches: 'Branch management is not enabled for this tenant.',
  enableQuotations: 'Quotations module is not enabled for this tenant.',
  enablePurchaseOrders: 'Purchase orders module is not enabled for this tenant.',
  enableTill: 'Till module is not enabled for this tenant.',
  enableAccounting: 'Accounting module is not enabled for this tenant.',
  enablePayroll: 'Payroll module is not enabled for this tenant.',
  requireApproval: 'Approval workflow is not enabled for this tenant.',
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
    { status: 400 }
  )
}
