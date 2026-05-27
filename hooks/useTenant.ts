'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import {
  hasPermission,
  type Permission,
  type Role,
  type RolePermissionsMap,
} from '@/lib/permissions/rbac'
import {
  DEFAULT_TENANT_FEATURES,
  toTenantFeatures,
  type TenantFeatures,
} from '@/lib/tenant/clientFeatures'
import { useTenantBootstrap } from '@/lib/tenant/TenantBootstrapContext'

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
  const bootstrap = useTenantBootstrap()
  const tenantId = session?.user?.tenantId ?? bootstrap.tenantId ?? null
  const tenantName =
    bootstrap.tenantId && bootstrap.tenantId === tenantId
      ? bootstrap.tenantName
      : null

  return {
    tenantId,
    tenantName,
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
  const bootstrap = useTenantBootstrap()
  const tenantId = session?.user?.tenantId ?? bootstrap.tenantId ?? null
  const hasBootstrappedPermissions = bootstrap.tenantId === tenantId
  const [fetchedPermissions, setFetchedPermissions] = useState<{
    tenantId: string
    rolePermissions: RolePermissionsMap | null
  } | null>(null)

  useEffect(() => {
    if (status === 'loading' || !tenantId) {
      return
    }

    if (fetchedPermissions?.tenantId === tenantId) {
      return
    }

    let cancelled = false

    fetch('/api/settings/role-permissions')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return
        setFetchedPermissions({
          tenantId,
          rolePermissions: (data?.rolePermissions as RolePermissionsMap | null) ?? null,
        })
      })
      .catch(() => {
        if (cancelled) return
        setFetchedPermissions({
          tenantId,
          rolePermissions: null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [fetchedPermissions?.tenantId, status, tenantId])

  const effectiveRolePermissions =
    fetchedPermissions?.tenantId === tenantId
      ? fetchedPermissions.rolePermissions
      : hasBootstrappedPermissions
        ? bootstrap.rolePermissions
        : null

  const isLoading =
    status === 'loading' ||
    Boolean(tenantId && !hasBootstrappedPermissions && fetchedPermissions?.tenantId !== tenantId)

  return {
    rolePermissions: effectiveRolePermissions,
    isLoading,
    hasTenantPermission: (role, permission) => {
      if (!role) return false
      return hasPermission({ role, rolePermissions: effectiveRolePermissions }, permission)
    },
  }
}

/**
 * useTenantFeatures — fetches and caches the tenant's feature flags.
 * Used by Sidebar, forms, and pages to conditionally show/hide optional modules.
 */
export function useTenantFeatures(): { features: TenantFeatures; isLoading: boolean } {
  const { data: session, status } = useSession()
  const bootstrap = useTenantBootstrap()
  const tenantId = session?.user?.tenantId ?? bootstrap.tenantId ?? null
  const bootstrappedFeatures =
    bootstrap.tenantId && bootstrap.tenantId === tenantId
      ? bootstrap.features
      : null
  const sessionFeatures = session?.user?.tenantFeatures

  const [fetchedFeatures, setFetchedFeatures] = useState<{
    tenantId: string
    features: TenantFeatures | null
  } | null>(null)

  useEffect(() => {
    if (status === 'loading') {
      return
    }

    if (!tenantId || sessionFeatures || bootstrappedFeatures || fetchedFeatures?.tenantId === tenantId) {
      return
    }

    let cancelled = false

    fetch(`/api/tenants/${tenantId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return
        setFetchedFeatures({
          tenantId,
          features: data ? toTenantFeatures(data) : null,
        })
      })
      .catch(() => {
        if (cancelled) return
        setFetchedFeatures({
          tenantId,
          features: null,
        })
      })

    return () => { cancelled = true }
  }, [bootstrappedFeatures, fetchedFeatures?.tenantId, sessionFeatures, status, tenantId])

  const features =
    sessionFeatures ??
    bootstrappedFeatures ??
    (fetchedFeatures?.tenantId === tenantId ? fetchedFeatures.features : null) ??
    DEFAULT_TENANT_FEATURES

  const isLoading =
    (!sessionFeatures && !bootstrappedFeatures && status === 'loading') ||
    (
      !sessionFeatures &&
      !bootstrappedFeatures &&
      Boolean(tenantId) &&
      fetchedFeatures?.tenantId !== tenantId
    )

  return { features, isLoading }
}
