'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { RolePermissionsMap } from '@/lib/permissions/rbac'
import {
  DEFAULT_TENANT_FEATURES,
  type TenantFeatures,
} from '@/lib/tenant/clientFeatures'

export interface TenantBootstrapValue {
  tenantId: string | null
  tenantName: string | null
  features: TenantFeatures
  rolePermissions: RolePermissionsMap | null
}

const DEFAULT_BOOTSTRAP: TenantBootstrapValue = {
  tenantId: null,
  tenantName: null,
  features: DEFAULT_TENANT_FEATURES,
  rolePermissions: null,
}

const TenantBootstrapContext = createContext<TenantBootstrapValue>(DEFAULT_BOOTSTRAP)

interface TenantBootstrapProviderProps {
  children: ReactNode
  value: TenantBootstrapValue
}

export function TenantBootstrapProvider({
  children,
  value,
}: TenantBootstrapProviderProps) {
  return (
    <TenantBootstrapContext.Provider value={value}>
      {children}
    </TenantBootstrapContext.Provider>
  )
}

export function useTenantBootstrap() {
  return useContext(TenantBootstrapContext)
}
