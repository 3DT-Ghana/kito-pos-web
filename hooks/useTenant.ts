'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import {
  hasPermission,
  type Permission,
  type Role,
  type RolePermissionsMap,
} from '@/lib/permissions/rbac'

/**
 * useTenant Hook
 *
 * Get current tenant information from session
 *
 * @example
 * ```tsx
 * const { tenantId, isLoading } = useTenant()
 * ```
 */

export function useTenant() {
  const { data: session, status } = useSession()

  return {
    tenantId: session?.user?.tenantId || null,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
  }
}

export function useRolePermissions(): {
  rolePermissions: RolePermissionsMap | null
  isLoading: boolean
  hasTenantPermission: (role: Role | null | undefined, permission: Permission) => boolean
} {
  const { data: session, status } = useSession()
  const tenantId = session?.user?.tenantId
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap | null>(null)
  const [loadedTenantId, setLoadedTenantId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading' || !tenantId) {
      return
    }

    let cancelled = false

    fetch('/api/settings/role-permissions')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data) return
        setRolePermissions((data.rolePermissions as RolePermissionsMap | null) ?? null)
        setLoadedTenantId(tenantId)
      })
      .catch(() => {
        if (!cancelled) {
          setRolePermissions(null)
          setLoadedTenantId(tenantId)
        }
      })

    return () => {
      cancelled = true
    }
  }, [tenantId, status])

  const effectiveRolePermissions = tenantId && loadedTenantId === tenantId
    ? rolePermissions
    : null
  const isLoading = status === 'loading' || Boolean(tenantId && loadedTenantId !== tenantId)

  return {
    rolePermissions: effectiveRolePermissions,
    isLoading,
    hasTenantPermission: (role, permission) => {
      if (!role) return false
      return hasPermission({ role, rolePermissions: effectiveRolePermissions }, permission)
    },
  }
}

// ─── Feature flags ────────────────────────────────────────────────────────────

export interface TenantFeatures {
  useUnitSystem: boolean
  enableRetailPrice: boolean
  enableWholesalePrice: boolean
  enablePromoPrice: boolean
  enableDiscounts: boolean
  enableSmsNotifications: boolean
  enablePosTerminal: boolean
  enableQuotations: boolean
  enablePurchaseOrders: boolean
  enableExpiryTracking: boolean
  enableBranches: boolean
  enableCreditSales: boolean
  enableExpenses: boolean
  enableTill: boolean
  allowSaleOnZeroStock: boolean
  enableBarcodeGenerator: boolean
  enableAccounting: boolean
  enablePayroll: boolean
  requireApproval: boolean
}

const DEFAULT_FEATURES: TenantFeatures = {
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

/**
 * useTenantFeatures — fetches and caches the tenant's feature flags.
 * Used by Sidebar, forms, and pages to conditionally show/hide optional modules.
 */
export function useTenantFeatures(): { features: TenantFeatures; isLoading: boolean } {
  const { data: session } = useSession()
  const tenantId = session?.user?.tenantId
  const [features, setFeatures] = useState<TenantFeatures>(DEFAULT_FEATURES)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false

    fetch(`/api/tenants/${tenantId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data) return
        setFeatures({
          useUnitSystem: data.useUnitSystem ?? false,
          enableRetailPrice: data.enableRetailPrice ?? false,
          enableWholesalePrice: data.enableWholesalePrice ?? false,
          enablePromoPrice: data.enablePromoPrice ?? false,
          enableDiscounts: data.enableDiscounts ?? false,
          enableSmsNotifications: data.enableSmsNotifications ?? false,
          enablePosTerminal: data.enablePosTerminal ?? false,
          enableQuotations: data.enableQuotations ?? false,
          enablePurchaseOrders: data.enablePurchaseOrders ?? false,
          enableExpiryTracking: data.enableExpiryTracking ?? false,
          enableBranches: data.enableBranches ?? false,
          enableCreditSales: data.enableCreditSales ?? false,
          enableExpenses: data.enableExpenses ?? false,
          enableTill: data.enableTill ?? false,
          allowSaleOnZeroStock: data.allowSaleOnZeroStock ?? false,
          enableBarcodeGenerator: data.enableBarcodeGenerator ?? false,
          enableAccounting: data.enableAccounting ?? false,
          enablePayroll: data.enablePayroll ?? false,
          requireApproval: data.requireApproval ?? false,
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
  }, [tenantId])

  return { features, isLoading }
}
