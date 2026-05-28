import { Role } from '@/lib/permissions/rbac'
import type { TenantFeatures } from '@/lib/tenant/clientFeatures'
import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface User {
    id: string
    email: string
    name: string
    // Tenant user fields (populated for tenant users, absent for agents)
    role: Role
    tenantId?: string | null
    branchId: string | null
    tenantName?: string | null
    tenantFeatures?: TenantFeatures
    // Agent/platform fields (populated for agents, absent for tenant users)
    platformRole?: 'AGENT' | 'SUPER_ADMIN'
    platformAdminId?: string | null
    agentId?: string
    agentStatus?: string
  }

  interface Session {
    user: {
      id: string
      email: string
      name: string
      // Tenant user fields
      role: Role
      tenantId?: string | null
      branchId: string | null
      tenantName?: string | null
      tenantFeatures?: TenantFeatures
      // Agent/platform fields
      platformRole?: 'AGENT' | 'SUPER_ADMIN'
      platformAdminId?: string | null
      agentId?: string
      agentStatus?: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    email: string
    name: string
    // Tenant user fields
    role: Role
    tenantId?: string | null
    branchId: string | null
    tenantName?: string | null
    tenantFeatures?: TenantFeatures
    // Agent/platform fields
    platformRole?: 'AGENT' | 'SUPER_ADMIN'
    platformAdminId?: string | null
    agentId?: string
    agentStatus?: string
  }
}
