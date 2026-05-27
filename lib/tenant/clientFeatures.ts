import type { TenantFeatureFlags } from '@/lib/tenant/features'

export interface TenantFeatures extends TenantFeatureFlags {
  useUnitSystem: boolean
  enableRetailPrice: boolean
  enableWholesalePrice: boolean
  enablePromoPrice: boolean
  enableDiscounts: boolean
  allowSaleOnZeroStock: boolean
}

export const DEFAULT_TENANT_FEATURES: TenantFeatures = {
  useUnitSystem: false,
  enableRetailPrice: false,
  enableWholesalePrice: false,
  enablePromoPrice: false,
  enableDiscounts: false,
  enableSmsNotifications: false,
  enablePosTerminal: false,
  enableQuotations: false,
  enablePurchaseOrders: false,
  enableExpiryTracking: false,
  enableBranches: false,
  enableCreditSales: false,
  enableExpenses: false,
  enableTill: false,
  allowSaleOnZeroStock: false,
  enableBarcodeGenerator: false,
  enableAccounting: false,
  enablePayroll: false,
  requireApproval: false,
}

export const TENANT_CLIENT_FEATURE_SELECT = {
  useUnitSystem: true,
  enableRetailPrice: true,
  enableWholesalePrice: true,
  enablePromoPrice: true,
  enableDiscounts: true,
  enableSmsNotifications: true,
  enablePosTerminal: true,
  enableQuotations: true,
  enablePurchaseOrders: true,
  enableExpiryTracking: true,
  enableBranches: true,
  enableCreditSales: true,
  enableExpenses: true,
  enableTill: true,
  allowSaleOnZeroStock: true,
  enableBarcodeGenerator: true,
  enableAccounting: true,
  enablePayroll: true,
  requireApproval: true,
} as const

export function toTenantFeatures(
  value?: Partial<TenantFeatures> | null
): TenantFeatures {
  return {
    useUnitSystem: value?.useUnitSystem ?? false,
    enableRetailPrice: value?.enableRetailPrice ?? false,
    enableWholesalePrice: value?.enableWholesalePrice ?? false,
    enablePromoPrice: value?.enablePromoPrice ?? false,
    enableDiscounts: value?.enableDiscounts ?? false,
    enableSmsNotifications: value?.enableSmsNotifications ?? false,
    enablePosTerminal: value?.enablePosTerminal ?? false,
    enableQuotations: value?.enableQuotations ?? false,
    enablePurchaseOrders: value?.enablePurchaseOrders ?? false,
    enableExpiryTracking: value?.enableExpiryTracking ?? false,
    enableBranches: value?.enableBranches ?? false,
    enableCreditSales: value?.enableCreditSales ?? false,
    enableExpenses: value?.enableExpenses ?? false,
    enableTill: value?.enableTill ?? false,
    allowSaleOnZeroStock: value?.allowSaleOnZeroStock ?? false,
    enableBarcodeGenerator: value?.enableBarcodeGenerator ?? false,
    enableAccounting: value?.enableAccounting ?? false,
    enablePayroll: value?.enablePayroll ?? false,
    requireApproval: value?.requireApproval ?? false,
  }
}
