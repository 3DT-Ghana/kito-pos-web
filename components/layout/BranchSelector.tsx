'use client'

import { useBranch } from '@/lib/branch/BranchContext'

/**
 * Branch selector dropdown shown in the app header.
 * Only renders when there are 2+ branches.
 * Owners can select "All Branches" (null) for a consolidated view.
 */
export function BranchSelector() {
  const {
    branches,
    branchesEnabled,
    currentBranchId,
    setBranchId,
    isLoading,
    canViewAllBranches,
    isBranchLocked,
  } = useBranch()

  if (!branchesEnabled || isLoading || branches.length < 2) return null

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400 hidden sm:block font-medium">Branch:</span>
      <div className="relative">
        <select
          value={currentBranchId ?? '__all__'}
          onChange={e => setBranchId(e.target.value === '__all__' ? null : e.target.value)}
          disabled={isBranchLocked}
          className="appearance-none pl-3 pr-7 py-1.5 bg-gray-100 border border-gray-200 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
        >
          {canViewAllBranches && <option value="__all__">All Branches</option>}
          {branches.map(b => (
            <option key={b.id} value={b.id}>
              {b.name}{b.isDefault ? ' (Main)' : ''}
            </option>
          ))}
        </select>
        <svg
          className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {isBranchLocked && (
        <span className="hidden lg:inline-flex text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
          Assigned
        </span>
      )}
    </div>
  )
}
