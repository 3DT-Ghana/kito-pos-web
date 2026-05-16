'use client'

import { useSession } from 'next-auth/react'

/**
 * useUser Hook — PETROS Business Management Mini
 *
 * Get current user information and role helpers from session
 *
 * @example
 * ```tsx
 * const { user, isOwner, isBranchManager, canManageUsers } = useUser()
 * ```
 */

export function useUser() {
  const { data: session, status } = useSession()

  const user = session?.user || null
  const role = user?.role ?? ''

  const isOwner = role === 'OWNER'
  const isStoreManager = role === 'STORE_MANAGER'
  const isBranchManager = role === 'BRANCH_MANAGER'
  const isCashier = role === 'CASHIER'
  const isInventoryManager = role === 'INVENTORY_MANAGER'
  const isAccountant = role === 'ACCOUNTANT'
  const isStaff = role === 'STAFF'
  const isCompanyAdmin = isOwner || isStoreManager
  const canManageUsers = isOwner || isBranchManager

  // True for any authenticated staff (all roles)
  const isTeamMember = !!role

  return {
    user,
    isOwner,
    isStoreManager,
    isBranchManager,
    isCashier,
    isInventoryManager,
    isAccountant,
    isStaff,
    isCompanyAdmin,
    canManageUsers,
    isTeamMember,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
  }
}
