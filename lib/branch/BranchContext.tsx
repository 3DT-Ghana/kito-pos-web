'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { ALL_BRANCHES_SELECTION, BRANCH_SELECTION_COOKIE } from '@/lib/branch/constants'

export interface Branch {
  id: string
  name: string
  isDefault: boolean
}

interface BranchBootstrapState {
  branches: Branch[]
  branchesEnabled: boolean
  currentBranchId: string | null
  assignedBranchId: string | null
  canViewAllBranches: boolean
  isBranchLocked: boolean
}

interface BranchContextValue {
  branches: Branch[]
  branchesEnabled: boolean
  currentBranchId: string | null
  currentBranch: Branch | null
  assignedBranchId: string | null
  canViewAllBranches: boolean
  isBranchLocked: boolean
  setBranchId: (id: string | null) => void
  refreshBranches: () => Promise<void>
  isLoading: boolean
}

const BranchContext = createContext<BranchContextValue>({
  branches: [],
  branchesEnabled: false,
  currentBranchId: null,
  currentBranch: null,
  assignedBranchId: null,
  canViewAllBranches: false,
  isBranchLocked: false,
  setBranchId: () => {},
  refreshBranches: async () => {},
  isLoading: false,
})

const STORAGE_KEY = BRANCH_SELECTION_COOKIE

function writeBranchSelection(value: string | null) {
  if (typeof window === 'undefined') return

  const storedValue = value ?? ALL_BRANCHES_SELECTION
  sessionStorage.setItem(STORAGE_KEY, storedValue)
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(storedValue)}; path=/; samesite=lax`
}

interface BranchProviderProps {
  children: ReactNode
  initialState?: BranchBootstrapState
}

export function BranchProvider({ children, initialState }: BranchProviderProps) {
  const initialStateRef = useRef(initialState)
  const [branches, setBranches] = useState<Branch[]>(() => initialState?.branches ?? [])
  const [branchesEnabled, setBranchesEnabled] = useState(() => initialState?.branchesEnabled ?? false)
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(() => initialState?.currentBranchId ?? null)
  const [assignedBranchId, setAssignedBranchId] = useState<string | null>(() => initialState?.assignedBranchId ?? null)
  const [canViewAllBranches, setCanViewAllBranches] = useState(() => initialState?.canViewAllBranches ?? false)
  const [isBranchLocked, setIsBranchLocked] = useState(() => initialState?.isBranchLocked ?? false)
  const [isLoading, setIsLoading] = useState(() => !initialState)

  useEffect(() => {
    if (initialStateRef.current) {
      writeBranchSelection(initialStateRef.current.currentBranchId)
    } else {
      const saved = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null
      if (saved) {
        document.cookie = `${STORAGE_KEY}=${encodeURIComponent(saved)}; path=/; samesite=lax`
      }
    }

    void fetchBranches()
  }, [])

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches')
      if (!res.ok) return
      const data = await res.json()
      const list: Branch[] = data.branches || []
      setBranches(list)
      setBranchesEnabled(Boolean(data.context?.branchesEnabled))
      setAssignedBranchId(data.context?.assignedBranchId ?? null)
      setCanViewAllBranches(Boolean(data.context?.canViewAllBranches))
      setIsBranchLocked(Boolean(data.context?.isBranchLocked))
      setCurrentBranchId(data.context?.currentBranchId ?? null)

      if (data.context?.currentBranchId === null && data.context?.canViewAllBranches) {
        writeBranchSelection(null)
      } else if (data.context?.currentBranchId) {
        writeBranchSelection(data.context.currentBranchId)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const setBranchId = (id: string | null) => {
    if (isBranchLocked) return
    setCurrentBranchId(id)
    writeBranchSelection(id)
  }

  const currentBranch = branches.find(b => b.id === currentBranchId) ?? null

  return (
    <BranchContext.Provider
      value={{
        branches,
        branchesEnabled,
        currentBranchId,
        currentBranch,
        assignedBranchId,
        canViewAllBranches,
        isBranchLocked,
        setBranchId,
        refreshBranches: fetchBranches,
        isLoading,
      }}
    >
      {children}
    </BranchContext.Provider>
  )
}

export function useBranch() {
  return useContext(BranchContext)
}
