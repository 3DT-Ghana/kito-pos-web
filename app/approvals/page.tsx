'use client'

import { useEffect, useState, useCallback } from 'react'
import { useUser } from '@/hooks/useUser'
import { useRolePermissions } from '@/hooks/useTenant'
import { formatCurrency } from '@/lib/utils/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { Pagination } from '@/components/ui/Pagination'
import { Bell } from 'lucide-react'

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

const FLAG_LABEL: Record<ApprovalFlag, string> = {
  DISCOUNT:         'Discount',
  PRICE_OVERRIDE:   'Price Override',
  CREDIT_SALE:      'Credit Sale',
  STOCK_ADJUSTMENT: 'Stock Adjustment',
}

const FLAG_COLOR: Record<ApprovalFlag, string> = {
  DISCOUNT:         'bg-amber-100 text-amber-700',
  PRICE_OVERRIDE:   'bg-red-100 text-red-700',
  CREDIT_SALE:      'bg-blue-100 text-blue-700',
  STOCK_ADJUSTMENT: 'bg-purple-100 text-purple-700',
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
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const canApprove = hasTenantPermission(user?.role, 'approve_transactions')

  const loadPendingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals?status=PENDING')
      if (res.ok) {
        const data = await res.json()
        setPendingCount((data.approvals ?? []).length)
      }
    } catch { /* non-critical */ }
  }, [])

  const load = useCallback(async (status: ApprovalStatus) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/approvals?status=${status}`)
      if (res.ok) {
        const data = await res.json()
        const list = data.approvals ?? []
        setApprovals(list)
        if (status === 'PENDING') setPendingCount(list.length)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load(tab) }, [tab, load])
  useEffect(() => setPage(1), [tab])
  useEffect(() => {
    // Keep pending count fresh when viewing other tabs
    if (tab !== 'PENDING') loadPendingCount()
  }, [tab, loadPendingCount])

  // Auto-refresh pending tab every 10s so POS approvals appear quickly
  useEffect(() => {
    if (tab !== 'PENDING' || !canApprove) return
    const interval = setInterval(() => load('PENDING'), 10000)
    return () => clearInterval(interval)
  }, [tab, canApprove, load])

  const handleAction = async () => {
    if (!actionState) return
    setErrorMsg('')
    const { id, type } = actionState
    const record = approvals.find(a => a.id === id)
    if (!record) return

    let url: string
    if (record.saleId) {
      url = `/api/sales/${record.saleId}/${type}`
    } else if (record.stockAdjustmentId) {
      url = `/api/approvals/stock/${record.stockAdjustmentId}/${type}`
    } else {
      return
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: noteInput.trim() || undefined }),
    })

    if (res.ok) {
      setSuccessMsg(type === 'approve' ? 'Transaction approved.' : 'Transaction rejected.')
      setTimeout(() => setSuccessMsg(''), 3000)
      setActionState(null)
      setNoteInput('')
      load('PENDING')
      loadPendingCount()
    } else {
      const err = await res.json()
      setErrorMsg(err.error ?? 'Action failed')
    }
  }

  const tabs: { key: ApprovalStatus; label: string }[] = [
    { key: 'PENDING',  label: 'Pending' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'REJECTED', label: 'Rejected' },
  ]

  if (permissionsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center p-6">
          <div className="bg-white border-2 border-gray-200 p-8 max-w-md text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Loading approvals</h2>
            <p className="text-gray-500 text-sm">Checking your current approval permissions.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!canApprove) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center p-6">
          <div className="bg-white border-2 border-gray-200 p-8 max-w-md text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h2>
            <p className="text-gray-500 text-sm">You do not have permission to view or manage transaction approvals.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transaction Approvals</h1>
            <p className="text-sm text-gray-500 mt-0.5">Review and approve flagged transactions from your team.</p>
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setTab('PENDING')}
              title={pendingCount > 0 ? `${pendingCount} transaction${pendingCount !== 1 ? 's' : ''} awaiting approval` : 'No pending approvals'}
              className="relative inline-flex items-center justify-center w-10 h-10 border-2 border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <Bell className={`w-5 h-5 ${pendingCount > 0 ? 'text-amber-500' : 'text-gray-400'}`} />
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-amber-500 text-white text-[10px] font-bold -full flex items-center justify-center leading-none">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm font-semibold px-4 py-3">
            ✓ {successMsg}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white border-2 border-gray-200 p-1 w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setApprovals([]) }}
              className={`px-4 py-2 text-sm font-bold transition-colors ${
                tab === t.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-white border-2 border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : approvals.length === 0 ? (
          <div className="bg-white border-2 border-gray-200 p-12 text-center">
            <div className="text-4xl mb-3">{tab === 'PENDING' ? '✅' : '📋'}</div>
            <p className="text-gray-500 font-semibold">
              {tab === 'PENDING' ? 'No pending transactions' : `No ${tab.toLowerCase()} transactions`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(record => {
              const sale = record.sale
              const stockAdjustment = record.stockAdjustment
              const flags = sale?.approvalFlags ?? [record.flag]

              return (
                <div key={record.id} className={`bg-white border-2 overflow-hidden ${
                  record.status === 'PENDING' ? 'border-amber-200' : record.status === 'APPROVED' ? 'border-green-200' : 'border-red-200'
                }`}>
                  {/* Header row */}
                  <div className={`px-4 py-2.5 flex items-center gap-3 ${
                    record.status === 'PENDING' ? 'bg-amber-50' : record.status === 'APPROVED' ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    <div className="flex gap-1.5 flex-wrap flex-1">
                      {flags.map(f => (
                        <span key={f} className={`text-xs font-bold px-2 py-0.5 -full ${FLAG_COLOR[f]}`}>
                          {FLAG_LABEL[f]}
                        </span>
                      ))}
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wide ${
                      record.status === 'PENDING' ? 'text-amber-700' : record.status === 'APPROVED' ? 'text-green-700' : 'text-red-600'
                    }`}>
                      {record.status}
                    </span>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    {/* Sale info */}
                    {sale ? (
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">Amount</p>
                          <p className="font-bold text-gray-900">{formatCurrency(sale.totalAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">Paid</p>
                          <p className="font-semibold text-gray-700">{formatCurrency(sale.paidAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">Outstanding</p>
                          <p className="font-semibold text-amber-700">
                            {formatCurrency(Math.max(0, sale.totalAmount - sale.paidAmount))}
                          </p>
                        </div>
                        {sale.customer && (
                          <div>
                            <p className="text-xs text-gray-400 font-semibold uppercase">Customer</p>
                            <p className="font-semibold text-gray-700">{sale.customer.name}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">Items</p>
                          <p className="font-semibold text-gray-700">
                            {sale.items.slice(0, 3).map(si => si.item.name).join(', ')}
                            {sale.items.length > 3 ? ` +${sale.items.length - 3} more` : ''}
                          </p>
                        </div>
                        {sale.items.some(si => (si.discountAmount || 0) > 0) && (
                          <div>
                            <p className="text-xs text-gray-400 font-semibold uppercase">Discounts</p>
                            <p className="font-semibold text-red-600">
                              −{formatCurrency(sale.items.reduce((s, si) => s + (si.discountAmount || 0), 0))}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {stockAdjustment ? (
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">Item</p>
                          <p className="font-bold text-gray-900">{stockAdjustment.item.name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">Change</p>
                          <p className={`font-bold ${stockAdjustment.type === 'INCREASE' ? 'text-green-700' : 'text-red-600'}`}>
                            {stockAdjustment.type === 'INCREASE' ? '+' : '−'}{stockAdjustment.quantity}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">Before → After</p>
                          <p className="font-semibold text-gray-700">
                            {stockAdjustment.previousQuantity} → {stockAdjustment.newQuantity}
                          </p>
                        </div>
                        <div className="min-w-60">
                          <p className="text-xs text-gray-400 font-semibold uppercase">Reason</p>
                          <p className="font-semibold text-gray-700">{stockAdjustment.reason}</p>
                        </div>
                      </div>
                    ) : null}

                    {/* Submitted by / approved by */}
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                      <span>
                        Submitted by <strong className="text-gray-700">{record.createdBy.name}</strong>
                        {' '}({record.createdBy.role.replace('_', ' ')})
                        {' · '}{new Date(record.createdAt).toLocaleString('en-GH')}
                      </span>
                      {record.approvedBy && (
                        <span>
                          {record.status === 'APPROVED' ? '✓ Approved' : '✗ Rejected'} by{' '}
                          <strong className="text-gray-700">{record.approvedBy.name}</strong>
                          {record.approvedAt ? ` · ${new Date(record.approvedAt).toLocaleString('en-GH')}` : ''}
                        </span>
                      )}
                      {record.note && <span>Note: &ldquo;{record.note}&rdquo;</span>}
                    </div>

                    {/* Actions */}
                    {record.status === 'PENDING' && (
                      <div className="flex gap-2 pt-1">
                        {actionState?.id === record.id ? (
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={noteInput}
                              onChange={e => setNoteInput(e.target.value)}
                              placeholder={`Optional note for ${actionState.type === 'approve' ? 'approval' : 'rejection'}...`}
                              className="w-full px-3 py-2 border-2 border-gray-200 text-sm focus:border-indigo-400 focus:outline-none"
                            />
                            {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
                            <div className="flex gap-2">
                              <button
                                onClick={handleAction}
                                className={`flex-1 py-2 text-sm font-bold text-white transition-colors ${
                                  actionState.type === 'approve'
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-red-500 hover:bg-red-600'
                                }`}
                              >
                                Confirm {actionState.type === 'approve' ? 'Approval' : 'Rejection'}
                              </button>
                              <button
                                onClick={() => { setActionState(null); setNoteInput(''); setErrorMsg('') }}
                                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => { setActionState({ id: record.id, type: 'approve' }); setErrorMsg('') }}
                              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-colors"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => { setActionState({ id: record.id, type: 'reject' }); setErrorMsg('') }}
                              className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm border-2 border-red-200 transition-colors"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <Pagination page={page} totalPages={Math.ceil(approvals.length / PAGE_SIZE)} onPageChange={setPage} totalItems={approvals.length} pageSize={PAGE_SIZE} />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
