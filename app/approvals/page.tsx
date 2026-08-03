'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useUser } from '@/hooks/useUser'
import { useRolePermissions } from '@/hooks/useTenant'
import { formatCurrency } from '@/lib/utils/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { Pagination } from '@/components/ui/Pagination'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type ApprovalFlag = 'DISCOUNT' | 'PRICE_OVERRIDE' | 'CREDIT_SALE' | 'STOCK_ADJUSTMENT'

interface ApprovalRecord {
  id: string
  flag: ApprovalFlag
  status: ApprovalStatus
  saleId: string | null
  stockAdjustmentId: string | null
  createdBy: { id: string; name: string; role: string }
  approvedBy: { id: string; name: string; role: string } | null
  approvedAt: string | null
  note: string | null
  createdAt: string
  sale?: {
    id: string
    totalAmount: number
    paidAmount: number
    paymentType: string
    paymentMethod: string
    approvalFlags: ApprovalFlag[]
    customer: { id: string; name: string } | null
    items: { quantity: number; price: number; discountAmount: number; item: { id: string; name: string } }[]
  } | null
  stockAdjustment?: {
    id: string
    type: 'INCREASE' | 'DECREASE'
    category: string
    quantity: number
    previousQuantity: number
    newQuantity: number
    reason: string
    item: { id: string; name: string }
  } | null
}

const PAGE_SIZE = 20
const FETCH_LIMIT = 200

const FLAG_LABEL: Record<ApprovalFlag, string> = {
  DISCOUNT: 'Discount',
  PRICE_OVERRIDE: 'Price Override',
  CREDIT_SALE: 'Credit Sale',
  STOCK_ADJUSTMENT: 'Stock Adjustment',
}

const FLAG_VARIANT: Record<ApprovalFlag, 'amber' | 'red' | 'blue' | 'violet'> = {
  DISCOUNT: 'amber',
  PRICE_OVERRIDE: 'red',
  CREDIT_SALE: 'blue',
  STOCK_ADJUSTMENT: 'violet',
}

const STATUS_VARIANT: Record<ApprovalStatus, 'amber' | 'green' | 'red'> = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
}

function formatRole(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GH')
}

function looksLikeHtmlDocument(raw: string) {
  const trimmed = raw.trim().toLowerCase()
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')
}

function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown> | null
  } catch {
    return null
  }
}

async function readApiPayload(response: Response) {
  const rawPayload = await response.text()
  const htmlResponse = looksLikeHtmlDocument(rawPayload)
  const payload = !rawPayload || htmlResponse ? null : safeParseJson(rawPayload)

  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || htmlResponse) {
      throw new Error('Your session has expired. Please sign in again.')
    }

    throw new Error(
      payload && typeof payload.error === 'string'
        ? payload.error
        : 'The approvals service is unavailable right now.'
    )
  }

  if (htmlResponse) {
    throw new Error('Your session has expired. Please sign in again.')
  }

  return payload
}

export default function ApprovalsPage() {
  const { user } = useUser()
  const { isLoading: permissionsLoading, hasTenantPermission } = useRolePermissions()
  const [tab, setTab] = useState<ApprovalStatus>('PENDING')
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [actionState, setActionState] = useState<{ id: string; type: 'approve' | 'reject' } | null>(null)
  const [noteInput, setNoteInput] = useState('')
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  // Without this, double-clicking Confirm fired two requests; the second hit
  // the server's conditional guard and painted "no longer pending" over an
  // approval that had actually succeeded.
  const [isActioning, setIsActioning] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [page, setPage] = useState(1)

  const canApprove = hasTenantPermission(user?.role, 'approve_transactions')

  const loadPendingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals?status=PENDING&countOnly=true', { cache: 'no-store' })
      const payload = await readApiPayload(res)
      setPendingCount(typeof payload?.total === 'number' ? payload.total : 0)
    } catch {
      // Non-critical in the sidebar/header summary path.
    }
  }, [])

  const load = useCallback(async (status: ApprovalStatus, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true)
      setLoadError('')
    }

    try {
      const res = await fetch(`/api/approvals?status=${status}&limit=${FETCH_LIMIT}`, { cache: 'no-store' })
      const payload = await readApiPayload(res)
      const list = Array.isArray(payload?.approvals) ? (payload.approvals as ApprovalRecord[]) : []

      setApprovals(list)
      if (status === 'PENDING') {
        setPendingCount(typeof payload?.total === 'number' ? payload.total : list.length)
      }
    } catch (error) {
      if (options?.silent) return

      setApprovals([])
      setLoadError(
        error instanceof Error && error.message
          ? error.message
          : 'Failed to load approvals.'
      )
    } finally {
      if (!options?.silent) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load(tab)
  }, [tab, load])

  useEffect(() => {
    setPage(1)
    setActionState(null)
    setActionError('')
    setNoteInput('')
  }, [tab])

  useEffect(() => {
    if (tab !== 'PENDING') {
      void loadPendingCount()
    }
  }, [tab, loadPendingCount])

  useEffect(() => {
    if (tab !== 'PENDING' || !canApprove) return

    const interval = window.setInterval(() => {
      void load('PENDING', { silent: true })
    }, 10000)

    return () => window.clearInterval(interval)
  }, [tab, canApprove, load])

  const handleAction = async () => {
    if (!actionState) return

    setActionError('')
    const record = approvals.find((approval) => approval.id === actionState.id)
    if (!record) return

    let url: string
    if (record.saleId) {
      url = `/api/sales/${record.saleId}/${actionState.type}`
    } else if (record.stockAdjustmentId) {
      url = `/api/approvals/stock/${record.stockAdjustmentId}/${actionState.type}`
    } else {
      // Was a bare `return`: the editor stayed open and every subsequent click
      // silently did nothing, with no message explaining why.
      setActionError('This approval is not linked to a sale or stock adjustment and cannot be actioned.')
      return
    }

    setIsActioning(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteInput.trim() || undefined }),
      })

      await readApiPayload(res)
      setSuccessMsg(actionState.type === 'approve' ? 'Transaction approved.' : 'Transaction rejected.')
      window.setTimeout(() => setSuccessMsg(''), 3000)
      setActionState(null)
      setNoteInput('')
      await load('PENDING')
      await loadPendingCount()
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : 'Action failed.'
      )
    } finally {
      setIsActioning(false)
    }
  }

  const paginated = approvals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(approvals.length / PAGE_SIZE)

  const renderActionEditor = (record: ApprovalRecord) => (
    <div className="space-y-3">
      <input
        type="text"
        value={noteInput}
        onChange={(event) => setNoteInput(event.target.value)}
        placeholder={`Optional note for ${actionState?.type === 'approve' ? 'approval' : 'rejection'}...`}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
      />
      {actionError && actionState?.id === record.id && (
        <p className="text-sm text-red-600">{actionError}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" onClick={handleAction} disabled={isActioning}>
          {isActioning
            ? 'Working…'
            : `Confirm ${actionState?.type === 'approve' ? 'Approval' : 'Rejection'}`}
        </Btn>
        <Btn
          size="sm"
          variant="secondary"
          onClick={() => {
            setActionState(null)
            setNoteInput('')
            setActionError('')
          }}
        >
          Cancel
        </Btn>
      </div>
    </div>
  )

  if (permissionsLoading) {
    return (
      <AppLayout>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Loading approvals</h1>
          <p className="mt-2 text-sm text-gray-500">Checking your approval permissions.</p>
        </div>
      </AppLayout>
    )
  }

  if (!canApprove) {
    return (
      <AppLayout>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Access Restricted</h1>
          <p className="mt-2 text-sm text-gray-500">
            You do not have permission to view or manage transaction approvals.
          </p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Transaction Approvals</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review sensitive sales and stock adjustments before they are finalized.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 lg:min-w-48">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pending Queue</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{pendingCount}</p>
            <p className="text-xs text-gray-500">Awaiting manager action</p>
          </div>
        </div>

        {successMsg && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {successMsg}
          </div>
        )}

        {loadError && (
          <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Btn size="sm" variant="secondary" onClick={() => void load(tab)}>
              Retry
            </Btn>
          </div>
        )}

        <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-2">
          {(['PENDING', 'APPROVED', 'REJECTED'] as ApprovalStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setTab(status)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                tab === status
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span>{status.charAt(0) + status.slice(1).toLowerCase()}</span>
              {status === 'PENDING' && pendingCount > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  tab === status ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                }`}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((index) => (
              <div key={index} className="h-20 rounded-lg border border-gray-200 bg-white animate-pulse" />
            ))}
          </div>
        ) : approvals.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-gray-900">No records found</h2>
            <p className="mt-2 text-sm text-gray-500">
              {tab === 'PENDING'
                ? 'There are no transactions waiting for approval.'
                : `There are no ${tab.toLowerCase()} approval records right now.`}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white lg:block">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Request</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Details</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Submitted By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Created</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginated.map((record) => {
                    const sale = record.sale
                    const stockAdjustment = record.stockAdjustment
                    const flags = sale?.approvalFlags ?? [record.flag]
                    const totalDiscount = sale?.items.reduce((sum, item) => sum + (item.discountAmount || 0), 0) ?? 0
                    const isEditing = actionState?.id === record.id

                    return (
                      <Fragment key={record.id}>
                        <tr className="align-top">
                          <td className="px-4 py-4">
                            <div className="space-y-2">
                              <p className="font-semibold text-gray-900">
                                {sale ? 'Sale Approval' : 'Stock Adjustment'}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {flags.map((flag) => (
                                  <Badge key={flag} variant={FLAG_VARIANT[flag]}>
                                    {FLAG_LABEL[flag]}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            {sale ? (
                              <div className="space-y-1.5">
                                <p className="font-medium text-gray-900">
                                  {sale.customer?.name || 'Walk-in customer'}
                                </p>
                                <p>
                                  {formatCurrency(sale.totalAmount)} total
                                  {sale.paidAmount < sale.totalAmount
                                    ? ` · ${formatCurrency(Math.max(0, sale.totalAmount - sale.paidAmount))} outstanding`
                                    : ''}
                                </p>
                                <p className="text-gray-500">
                                  {sale.items.slice(0, 3).map((item) => item.item.name).join(', ')}
                                  {sale.items.length > 3 ? ` +${sale.items.length - 3} more` : ''}
                                </p>
                                {totalDiscount > 0 && (
                                  <p className="text-red-600">Discounts: -{formatCurrency(totalDiscount)}</p>
                                )}
                              </div>
                            ) : stockAdjustment ? (
                              <div className="space-y-1.5">
                                <p className="font-medium text-gray-900">{stockAdjustment.item.name}</p>
                                <p>
                                  {stockAdjustment.type === 'INCREASE' ? '+' : '-'}
                                  {stockAdjustment.quantity} units
                                  {' · '}
                                  {stockAdjustment.previousQuantity} to {stockAdjustment.newQuantity}
                                </p>
                                <p className="text-gray-500">{stockAdjustment.reason}</p>
                              </div>
                            ) : (
                              <span className="text-gray-400">No linked record</span>
                            )}
                            {record.note && (
                              <p className="mt-2 text-xs text-gray-500">Note: {record.note}</p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            <p className="font-medium text-gray-900">{record.createdBy.name}</p>
                            <p>{formatRole(record.createdBy.role)}</p>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            <p>{formatDateTime(record.createdAt)}</p>
                            {record.approvedBy && (
                              <p className="mt-2 text-xs text-gray-500">
                                {record.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {record.approvedBy.name}
                                {' · '}
                                {formatDateTime(record.approvedAt)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant={STATUS_VARIANT[record.status]}>{record.status}</Badge>
                          </td>
                          <td className="px-4 py-4">
                            {record.status === 'PENDING' ? (
                              <div className="flex flex-wrap gap-2">
                                <Btn
                                  size="sm"
                                  onClick={() => {
                                    setActionState({ id: record.id, type: 'approve' })
                                    setActionError('')
                                    // Cleared on row switch — a note typed for one approval was
                                    // otherwise attached to whichever approval was actioned next.
                                    setNoteInput('')
                                  }}
                                >
                                  Approve
                                </Btn>
                                <Btn
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setActionState({ id: record.id, type: 'reject' })
                                    setActionError('')
                                    // Cleared on row switch — a note typed for one approval was
                                    // otherwise attached to whichever approval was actioned next.
                                    setNoteInput('')
                                  }}
                                >
                                  Reject
                                </Btn>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500">Completed</span>
                            )}
                          </td>
                        </tr>
                        {isEditing && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-4">
                              {renderActionEditor(record)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 lg:hidden">
              {paginated.map((record) => {
                const sale = record.sale
                const stockAdjustment = record.stockAdjustment
                const flags = sale?.approvalFlags ?? [record.flag]
                const totalDiscount = sale?.items.reduce((sum, item) => sum + (item.discountAmount || 0), 0) ?? 0
                const isEditing = actionState?.id === record.id

                return (
                  <div key={record.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {sale ? 'Sale Approval' : 'Stock Adjustment'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">{formatDateTime(record.createdAt)}</p>
                      </div>
                      <Badge variant={STATUS_VARIANT[record.status]}>{record.status}</Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {flags.map((flag) => (
                        <Badge key={flag} variant={FLAG_VARIANT[flag]}>
                          {FLAG_LABEL[flag]}
                        </Badge>
                      ))}
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-gray-600">
                      {sale ? (
                        <>
                          <p className="font-medium text-gray-900">{sale.customer?.name || 'Walk-in customer'}</p>
                          <p>{formatCurrency(sale.totalAmount)} total</p>
                          {sale.paidAmount < sale.totalAmount && (
                            <p>{formatCurrency(Math.max(0, sale.totalAmount - sale.paidAmount))} outstanding</p>
                          )}
                          <p className="text-gray-500">
                            {sale.items.slice(0, 3).map((item) => item.item.name).join(', ')}
                            {sale.items.length > 3 ? ` +${sale.items.length - 3} more` : ''}
                          </p>
                          {totalDiscount > 0 && (
                            <p className="text-red-600">Discounts: -{formatCurrency(totalDiscount)}</p>
                          )}
                        </>
                      ) : stockAdjustment ? (
                        <>
                          <p className="font-medium text-gray-900">{stockAdjustment.item.name}</p>
                          <p>
                            {stockAdjustment.type === 'INCREASE' ? '+' : '-'}
                            {stockAdjustment.quantity} units
                          </p>
                          <p>
                            {stockAdjustment.previousQuantity} to {stockAdjustment.newQuantity}
                          </p>
                          <p className="text-gray-500">{stockAdjustment.reason}</p>
                        </>
                      ) : null}
                    </div>

                    <div className="mt-4 text-xs text-gray-500">
                      Submitted by <span className="font-medium text-gray-700">{record.createdBy.name}</span>
                      {' · '}
                      {formatRole(record.createdBy.role)}
                    </div>

                    {record.note && (
                      <p className="mt-2 text-xs text-gray-500">Note: {record.note}</p>
                    )}

                    {record.status === 'PENDING' && (
                      <div className="mt-4 space-y-3">
                        {isEditing ? (
                          renderActionEditor(record)
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Btn
                              size="sm"
                              onClick={() => {
                                setActionState({ id: record.id, type: 'approve' })
                                setActionError('')
                                // Cleared on row switch — a note typed for one approval was
                                // otherwise attached to whichever approval was actioned next.
                                setNoteInput('')
                              }}
                            >
                              Approve
                            </Btn>
                            <Btn
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setActionState({ id: record.id, type: 'reject' })
                                setActionError('')
                                // Cleared on row switch — a note typed for one approval was
                                // otherwise attached to whichever approval was actioned next.
                                setNoteInput('')
                              }}
                            >
                              Reject
                            </Btn>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={approvals.length}
              pageSize={PAGE_SIZE}
            />
          </>
        )}
      </div>
    </AppLayout>
  )
}
