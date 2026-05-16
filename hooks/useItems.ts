'use client'

import { useState, useEffect } from 'react'
import { useBranch } from '@/lib/branch/BranchContext'

/**
 * useItems Hook
 *
 * Fetch and manage items data
 *
 * @example
 * ```tsx
 * const { items, loading, error, refetch } = useItems({ search: 'coca' })
 * ```
 */

interface UseItemsOptions {
  search?: string
  manufacturerId?: string
  lowStock?: boolean
}

export function useItems(options: UseItemsOptions = {}) {
  const { currentBranchId } = useBranch()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (options.search) params.append('search', options.search)
      if (options.manufacturerId) params.append('manufacturerId', options.manufacturerId)
      if (options.lowStock) params.append('lowStock', 'true')

      const response = await fetch(`/api/items?${params}`)

      if (!response.ok) {
        throw new Error('Failed to fetch items')
      }

      const data = await response.json()
      setItems(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch items')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [options.search, options.manufacturerId, options.lowStock, currentBranchId])

  return {
    items,
    loading,
    error,
    refetch: fetchItems,
  }
}
