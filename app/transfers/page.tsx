'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useBranch } from '@/lib/branch/BranchContext'
import { useTenantFeatures } from '@/hooks/useTenant'
import { useUser } from '@/hooks/useUser'
import { formatDateTime } from '@/lib/utils/format'

interface BranchOption {
  id: string
  name: string
  isDefault: boolean
}

interface SourceItemOption {
  id: string
  name: string
  quantity: number
  manufacturer: { id: string; name: string } | null
  unitName?: string | null
}

interface TransferLine {
  itemId: string
  quantity: string
}

interface TransferRecord {
  id: string
  fromBranchId: string
  toBranchId: string
  status: 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED'
  note: string | null
  createdAt: string
  dispatchedAt: string | null
  receivedAt: string | null
  fromBranch: { id: string; name: string } | null
  toBranch: { id: string; name: string } | null
  initiatedBy: { id: string; name: string } | null
  dispatchedBy: { id: string; name: string } | null
  receivedBy: { id: string; name: string } | null
  items: Array<{
    id: string
    itemName: string
    quantity: number
    unitName: string | null
  }>
}

const STATUS_META: Record<TransferRecord['status'], { label: string; className: string }> = {
  PENDING:    { label: 'Pending',    className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60' },
  IN_TRANSIT: { label: 'In Transit', className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60' },
  COMPLETED:  { label: 'Completed',  className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' },
  CANCELLED:  { label: 'Cancelled',  className: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200/60' },
}

async function fetchTransfersData(status: string) {
  const query = status === 'all' ? '' : `?status=${status}`
  const res = await fetch(`/api/transfers${query}`)
  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.error || 'Failed to load transfers')
  }

  return data as {
    transfers: TransferRecord[]
    branches: BranchOption[]
  }
}

async function fetchSourceItemsData() {
  const res = await fetch('/api/items')
  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.error || 'Failed to load source items')
  }

  return (Array.isArray(data) ? data : data?.data || []) as SourceItemOption[]
}

export default function TransfersPage() {
  const router = useRouter()
  const { user, isLoading: isUserLoading } = useUser()
  const { features, isLoading: isFeaturesLoading } = useTenantFeatures()
  const {
    branchesEnabled,
    currentBranchId,
    currentBranch,
    assignedBranchId,
    canViewAllBranches,
    isLoading: isBranchLoading,
  } = useBranch()

  const canManageTransfers = ['OWNER', 'STORE_MANAGER', 'BRANCH_MANAGER', 'INVENTORY_MANAGER'].includes(user?.role ?? '')
  const [transfers, setTransfers] = useState<TransferRecord[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [sourceItems, setSourceItems] = useState<SourceItemOption[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | TransferRecord['status']>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    toBranchId: '',
    note: '',
    items: [{ itemId: '', quantity: '1' }] as TransferLine[],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isItemsLoading, setIsItemsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const destinationBranches = useMemo(
    () => branches.filter((branch) => branch.id !== currentBranchId),
    [branches, currentBranchId]
  )

  const transferCounts = useMemo(
    () => ({
      pending: transfers.filter((transfer) => transfer.status === 'PENDING').length,
      inTransit: transfers.filter((transfer) => transfer.status === 'IN_TRANSIT').length,
      completed: transfers.filter((transfer) => transfer.status === 'COMPLETED').length,
    }),
    [transfers]
  )

  useEffect(() => {
    if (!isUserLoading && !canManageTransfers) {
      router.push('/dashboard')
    }
  }, [canManageTransfers, isUserLoading, router])

  useEffect(() => {
    if (!canManageTransfers || !features.enableBranches) {
      setIsLoading(false)
      return
    }

    let active = true

    const load = async () => {
      try {
        setIsLoading(true)
        const data = await fetchTransfersData(statusFilter)
        if (!active) return
        setTransfers(data.transfers || [])
        setBranches(data.branches || [])
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load transfers')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [canManageTransfers, currentBranchId, features.enableBranches, statusFilter])

  useEffect(() => {
    if (!canManageTransfers || !features.enableBranches || !currentBranchId) {
      setSourceItems([])
      setIsItemsLoading(false)
      return
    }

    let active = true

    const load = async () => {
      try {
        setIsItemsLoading(true)
        const items = await fetchSourceItemsData()
        if (!active) return
        setSourceItems(items)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load source items')
      } finally {
        if (active) setIsItemsLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [canManageTransfers, currentBranchId, features.enableBranches])

  const reloadTransfers = async () => {
    const data = await fetchTransfersData(statusFilter)
    setTransfers(data.transfers || [])
    setBranches(data.branches || [])
  }

  const reloadSourceItems = async () => {
    if (!currentBranchId) {
      setSourceItems([])
      return
    }
    setSourceItems(await fetchSourceItemsData())
  }

  const resetForm = () => {
    setForm({
      toBranchId: '',
      note: '',
      items: [{ itemId: '', quantity: '1' }],
    })
  }

  const updateLine = (index: number, updates: Partial<TransferLine>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) => (lineIndex === index ? { ...line, ...updates } : line)),
    }))
  }

  const addLine = () => {
    setForm((current) => ({
      ...current,
      items: [...current.items, { itemId: '', quantity: '1' }],
    }))
  }

  const removeLine = (index: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, lineIndex) => lineIndex !== index),
    }))
  }

  const handleCreateTransfer = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setIsSaving(true)

    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toBranchId: form.toBranchId,
          note: form.note || null,
          items: form.items.map((line) => ({
            itemId: line.itemId,
            quantity: Number(line.quantity),
          })),
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create transfer')
      }

      resetForm()
      setShowForm(false)
      setSuccess('Transfer created successfully.')
      await Promise.all([reloadTransfers(), reloadSourceItems()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create transfer')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTransferAction = async (transferId: string, action: 'dispatch' | 'receive' | 'cancel') => {
    setError('')
    setSuccess('')
    setActionId(transferId)

    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Failed to ${action} transfer`)
      }

      const actionLabels: Record<typeof action, string> = {
        dispatch: 'Transfer dispatched successfully.',
        receive: 'Transfer received successfully.',
        cancel: 'Transfer cancelled successfully.',
      }

      setSuccess(actionLabels[action])
      await Promise.all([reloadTransfers(), reloadSourceItems()])
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} transfer`)
    } finally {
      setActionId(null)
    }
  }

  if (isUserLoading || isFeaturesLoading || isBranchLoading || (canManageTransfers && isLoading)) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!canManageTransfers) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!features.enableBranches || !branchesEnabled) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="bg-white shadow-sm ring-1 ring-black/5 rounded-2xl p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Transfers</h1>
            <p className="text-gray-500">
              Enable the branch feature first to move stock between locations.
            </p>
            <button
              onClick={() => router.push('/settings')}
              className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Open Settings
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  const canCreateTransfer = Boolean(currentBranchId)

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Stock Transfers</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Move stock safely between branches with dispatch and receive checkpoints.
            </p>
          </div>
          <button
            onClick={() => {
              setShowForm((current) => !current)
              setError('')
              setSuccess('')
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm text-sm disabled:opacity-50"
            disabled={!canCreateTransfer}
          >
            {showForm ? 'Close Form' : '+ New Transfer'}
          </button>
        </div>

        {!currentBranchId && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
            Select a source branch from the header before creating a transfer. You can still review transfer history across all branches.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm font-medium">
            {success}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs font-semibold text-gray-500 uppercase">All Transfers</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{transfers.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs font-semibold text-amber-600 uppercase">Pending</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{transferCounts.pending}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs font-semibold text-blue-600 uppercase">In Transit</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{transferCounts.inTransit}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs font-semibold text-green-600 uppercase">Completed</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{transferCounts.completed}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['all', 'PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {status === 'all' ? 'All Statuses' : STATUS_META[status].label}
            </button>
          ))}
        </div>

        {showForm && (
          <form onSubmit={handleCreateTransfer} className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm p-5 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Create Transfer</h2>
              <p className="text-sm text-gray-500 mt-1">
                Source branch: <span className="font-semibold text-gray-700">{currentBranch?.name ?? 'Not selected'}</span>
                {assignedBranchId === currentBranchId && assignedBranchId ? ' · Assigned branch' : ''}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Destination Branch *</label>
                <select
                  value={form.toBranchId}
                  onChange={(event) => setForm((current) => ({ ...current, toBranchId: event.target.value }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm bg-white"
                  required
                >
                  <option value="">Select destination branch</option>
                  {destinationBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}{branch.isDefault ? ' (Main)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Note</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Optional note for the receiving branch"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Transfer Items</h3>
                  <p className="text-xs text-gray-500">
                    Select items from {currentBranch?.name ?? 'the selected branch'} and specify the quantity to send.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addLine}
                  className="px-3 py-2 border border-blue-200 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-50"
                >
                  + Add Line
                </button>
              </div>

              {form.items.map((line, index) => (
                <div key={`${index}-${line.itemId}`} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_110px] gap-3 items-start">
                  <div>
                    <select
                      value={line.itemId}
                      onChange={(event) => updateLine(index, { itemId: event.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm bg-white"
                      required
                      disabled={isItemsLoading || !currentBranchId}
                    >
                      <option value="">{isItemsLoading ? 'Loading items…' : 'Select item'}</option>
                      {sourceItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.quantity} {item.unitName || 'unit'}{item.manufacturer ? ` · ${item.manufacturer.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.quantity}
                      onChange={(event) => updateLine(index, { quantity: event.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
                      placeholder="Quantity"
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={form.items.length === 1}
                    className="px-3 py-3 border border-red-100 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
                className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !currentBranchId}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {isSaving ? 'Creating…' : 'Create Transfer'}
              </button>
            </div>
          </form>
        )}

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Transfer History</h2>
          </div>

          {transfers.length === 0 ? (
            <div className="py-14 text-center text-gray-500">
              <div className="text-4xl mb-3">📦</div>
              <p className="font-semibold">No transfers found</p>
              <p className="text-sm mt-1">Create your first transfer when stock needs to move between branches.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {transfers.map((transfer) => {
                const status = STATUS_META[transfer.status]
                const canDispatch =
                  transfer.status === 'PENDING' &&
                  (canViewAllBranches || currentBranchId === transfer.fromBranchId || assignedBranchId === transfer.fromBranchId)
                const canReceive =
                  transfer.status === 'IN_TRANSIT' &&
                  (canViewAllBranches || currentBranchId === transfer.toBranchId || assignedBranchId === transfer.toBranchId)
                const canCancel =
                  transfer.status === 'PENDING' &&
                  (canViewAllBranches || currentBranchId === transfer.fromBranchId || assignedBranchId === transfer.fromBranchId)

                return (
                  <div key={transfer.id} className="px-5 py-4 space-y-3">
                    <div className="flex flex-col xl:flex-row xl:items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-gray-900">
                            {transfer.fromBranch?.name ?? 'Unknown Branch'} <span className="text-gray-400">→</span> {transfer.toBranch?.name ?? 'Unknown Branch'}
                          </span>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          Created {formatDateTime(transfer.createdAt)}
                          {transfer.initiatedBy ? ` by ${transfer.initiatedBy.name}` : ''}
                        </p>
                        {transfer.note && (
                          <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded-lg px-3 py-2">
                            {transfer.note}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {canDispatch && (
                          <button
                            onClick={() => handleTransferAction(transfer.id, 'dispatch')}
                            disabled={actionId === transfer.id}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                          >
                            {actionId === transfer.id ? 'Working…' : 'Dispatch'}
                          </button>
                        )}
                        {canReceive && (
                          <button
                            onClick={() => handleTransferAction(transfer.id, 'receive')}
                            disabled={actionId === transfer.id}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                          >
                            {actionId === transfer.id ? 'Working…' : 'Receive'}
                          </button>
                        )}
                        {canCancel && (
                          <button
                            onClick={() => handleTransferAction(transfer.id, 'cancel')}
                            disabled={actionId === transfer.id}
                            className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
                      <div className="bg-gray-50 rounded-xl px-3 py-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Items</p>
                        <div className="space-y-1.5">
                          {transfer.items.map((item) => (
                            <div key={item.id} className="text-gray-700">
                              {item.itemName} · <span className="font-semibold">{item.quantity}</span> {item.unitName || 'unit'}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl px-3 py-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Dispatch</p>
                        <p className="text-gray-700">
                          {transfer.dispatchedAt
                            ? `${formatDateTime(transfer.dispatchedAt)}${transfer.dispatchedBy ? ` by ${transfer.dispatchedBy.name}` : ''}`
                            : 'Not dispatched yet'}
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl px-3 py-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Receipt</p>
                        <p className="text-gray-700">
                          {transfer.receivedAt
                            ? `${formatDateTime(transfer.receivedAt)}${transfer.receivedBy ? ` by ${transfer.receivedBy.name}` : ''}`
                            : 'Not received yet'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
