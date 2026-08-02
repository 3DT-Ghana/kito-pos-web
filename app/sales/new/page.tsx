'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { SaleForm } from '@/components/forms/SaleForm'
import { OperationalBranchPrompt } from '@/components/branch/OperationalBranchPrompt'
import { useBranch } from '@/lib/branch/BranchContext'
import Link from 'next/link'

type PageState = 'form' | 'success' | 'pending_approval'

export default function NewSalePage() {
  const router = useRouter()
  const {
    assignedBranchId,
    branchesEnabled,
    currentBranchId,
    isLoading: isBranchLoading,
    setBranchId,
  } = useBranch()
  const [pageState, setPageState] = useState<PageState>('form')
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)
  const isAutoSelectingAssignedBranch =
    !isBranchLoading && branchesEnabled && !currentBranchId && Boolean(assignedBranchId)
  const requiresOperationalBranch =
    !isBranchLoading && branchesEnabled && !currentBranchId && !assignedBranchId

  useEffect(() => {
    if (isAutoSelectingAssignedBranch && assignedBranchId) {
      setBranchId(assignedBranchId)
    }
  }, [assignedBranchId, isAutoSelectingAssignedBranch, setBranchId])

  const handleSubmit = async (data: unknown) => {
    const response = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(data as object), source: 'sales' }),
    })

    const result = await response.json()

    if (response.status === 202 && result.requiresApproval) {
      setLastSaleId(result.saleId)
      setPageState('pending_approval')
      return
    }

    if (!response.ok) {
      throw new Error(result.error || 'Failed to create sale')
    }

    setLastSaleId(result.id || result.data?.id || null)
    setPageState('success')
  }

  const handleCancel = () => router.push('/sales')

  if (pageState === 'pending_approval') {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto text-center py-12">
          <div className="w-24 h-24 bg-amber-100 -full flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl">⏳</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Awaiting Approval</h2>
          <p className="text-gray-600 mb-2">This sale has been flagged and is waiting for manager approval.</p>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 inline-block mb-8">
            Receipt cannot be printed until a manager approves the transaction.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push('/approvals')}
              className="px-6 py-3 bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors"
            >
              View Approvals Queue
            </button>
            <button
              onClick={() => { setPageState('form'); setLastSaleId(null) }}
              className="px-6 py-3 bg-green-600 text-white font-bold hover:bg-green-700 transition-colors"
            >
              New Sale
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (pageState === 'success') {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto text-center py-12">
          <div className="w-24 h-24 bg-green-100 -full flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Sale Created!</h2>
          <p className="text-gray-600 mb-8">The sale was recorded successfully.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {lastSaleId && (
              <Link
                href={`/sales/${lastSaleId}`}
                className="px-6 py-3 bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
              >
                Print Receipt
              </Link>
            )}
            <button
              onClick={() => { setPageState('form'); setLastSaleId(null) }}
              className="px-6 py-3 bg-green-600 text-white font-bold hover:bg-green-700 transition-colors"
            >
              New Sale
            </button>
            <button
              onClick={() => router.push('/sales')}
              className="px-6 py-3 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50"
            >
              View All Sales
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Sale</h1>
            <p className="text-sm text-gray-500">Record a new sales transaction</p>
          </div>
        </div>

        {isBranchLoading || isAutoSelectingAssignedBranch ? (
          <div className="bg-white shadow-sm border border-gray-200 p-8 text-center text-sm text-gray-500">
            Loading branch selection...
          </div>
        ) : requiresOperationalBranch ? (
          <OperationalBranchPrompt
            title="Choose a branch before recording this sale"
            description="Sales must be attached to one branch so stock and reports stay accurate. Pick the branch you are working from to continue."
          />
        ) : (
          <div className="bg-white shadow-sm border border-gray-200 p-5 md:p-6">
            <SaleForm onSubmit={handleSubmit} onCancel={handleCancel} />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
