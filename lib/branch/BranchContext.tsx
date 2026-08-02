'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  // Set once the user picks a branch, so a late /api/branches response cannot
  // overwrite their selection with the value the server had at page load.
  const userSelectedRef = useRef(false)
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
      // On failure, keep whatever the server rendered rather than falling back
      // to branchesEnabled: false — that hid the branch switcher entirely and
      // stranded the user on the cookie's branch with no error and no way back.
      if (!res.ok) return
      const data = await res.json()
      const list: Branch[] = data.branches || []
      setBranches(list)
      setBranchesEnabled(Boolean(data.context?.branchesEnabled))
      setAssignedBranchId(data.context?.assignedBranchId ?? null)
      setCanViewAllBranches(Boolean(data.context?.canViewAllBranches))
      setIsBranchLocked(Boolean(data.context?.isBranchLocked))

      // A request that started before the user switched branches would
      // otherwise land afterwards and silently revert their choice.
      if (!userSelectedRef.current) {
        setCurrentBranchId(data.context?.currentBranchId ?? null)

        if (data.context?.currentBranchId === null && data.context?.canViewAllBranches) {
          writeBranchSelection(null)
        } else if (data.context?.currentBranchId) {
          writeBranchSelection(data.context.currentBranchId)
        }
      }
    } catch {
      // Network failure — same reasoning as the !res.ok path above: hold the
      // server-rendered state rather than throwing an unhandled rejection.
    } finally {
      setIsLoading(false)
    }
  }

  const setBranchId = (id: string | null) => {
    if (isBranchLocked) return
    userSelectedRef.current = true
    setCurrentBranchId(id)
    writeBranchSelection(id)
    // Server components read the branch from the cookie at request time, so
    // without this the page kept rendering the previous branch's rows while
    // the switcher showed the new one — which reads as a data leak even though
    // the server is scoping correctly.
    router.refresh()
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
