'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { ChevronLeft, CheckCircle, XCircle, Clock } from 'lucide-react'

interface Application {
  id: string
  businessName: string
  businessType: string
  businessAddress: string
  gpsLatitude: number | null
  gpsLongitude: number | null
  ownerFullName: string
  ownerPhone: string
  ownerEmail: string
  ownerGhanaCardNumber: string | null
  ownerGhanaCardImageUrl: string | null
  status: string
  rejectionReason: string | null
  tenantId: string | null
  reviewedById: string | null
  reviewedAt: string | null
  createdAt: string
  agent: {
    id: string
    agentCode: string
    fullName: string
    email: string
    phone: string
  }
}

export default function AdminApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [application, setApplication] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [rejectionReason, setRejectionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function load() {
    fetch(`/api/admin/applications/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setApplication(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  async function handleAction(action: 'approve' | 'reject') {
    if (action === 'reject' && !rejectionReason.trim()) {
      setResult({ type: 'error', text: 'Please enter a rejection reason.' })
      return
    }
    setActionLoading(true)
    setResult(null)

    const res = await fetch(`/api/admin/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        ...(action === 'reject' ? { rejectionReason: rejectionReason.trim() } : {}),
      }),
    })

    const data = await res.json()
    setActionLoading(false)

    if (!res.ok) {
      setResult({ type: 'error', text: data.error ?? 'Action failed' })
    } else {
      if (action === 'approve') {
        const text = data.ownerNotified
          ? 'Approved. Tenant created and login details emailed to the business owner.'
          : `Approved. Tenant created, but email delivery failed. Share this temporary password manually: ${data.tempPassword}`
        setResult({
          type: 'success',
          text,
        })
      } else {
        setResult({ type: 'success', text: 'Application rejected.' })
      }
      load()
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    )
  }

  if (!application) {
    return (
      <AdminLayout>
        <p className="text-sm text-red-500">Application not found.</p>
      </AdminLayout>
    )
  }

  const isPending = application.status === 'PENDING'

  const statusIcon =
    application.status === 'APPROVED' ? (
      <CheckCircle className="w-5 h-5 text-emerald-600" />
    ) : application.status === 'REJECTED' ? (
      <XCircle className="w-5 h-5 text-red-500" />
    ) : (
      <Clock className="w-5 h-5 text-amber-500" />
    )

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link
            href="/admin/applications"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Applications
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{application.businessName}</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Submitted {new Date(application.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {statusIcon}
              <StatusBadge status={application.status} />
            </div>
          </div>
        </div>

        {result && (
          <div
            className={`text-sm px-4 py-3 rounded-lg border ${
              result.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                : 'bg-red-50 text-red-700 border-red-100'
            }`}
          >
            {result.text}
          </div>
        )}

        {application.rejectionReason && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
            <span className="font-medium">Rejection reason:</span> {application.rejectionReason}
          </div>
        )}

        {/* Agent */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">Submitted by Agent</h2>
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-medium text-gray-900">{application.agent.fullName}</p>
              <p className="text-gray-400 text-xs">{application.agent.agentCode} · {application.agent.email}</p>
            </div>
            <Link
              href={`/admin/agents/${application.agent.id}`}
              className="text-xs text-indigo-600 hover:underline"
            >
              View agent →
            </Link>
          </div>
        </div>

        {/* Business details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Business Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Row label="Type" value={application.businessType.charAt(0) + application.businessType.slice(1).toLowerCase()} />
            <Row label="Address" value={application.businessAddress} />
            {application.gpsLatitude && (
              <Row label="GPS" value={`${application.gpsLatitude}, ${application.gpsLongitude}`} />
            )}
          </div>
        </div>

        {/* Owner details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Owner Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Row label="Full Name" value={application.ownerFullName} />
            <Row label="Phone" value={application.ownerPhone} />
            <Row label="Email" value={application.ownerEmail} />
            {application.ownerGhanaCardNumber && (
              <Row label="Ghana Card No." value={application.ownerGhanaCardNumber} />
            )}
          </div>
        </div>

        {/* Actions (only for PENDING) */}
        {isPending && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">Review Decision</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Rejection reason (required if rejecting)
              </label>
              <input
                type="text"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Incomplete information, invalid Ghana Card"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleAction('approve')}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Processing…' : 'Approve & Create Tenant'}
              </button>
              <button
                onClick={() => handleAction('reject')}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-red-100 text-red-700 text-sm font-medium rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {application.tenantId && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-800">
            Tenant created with ID: <span className="font-mono font-medium">{application.tenantId}</span>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-900">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-red-100 text-red-700',
    SUSPENDED: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}
