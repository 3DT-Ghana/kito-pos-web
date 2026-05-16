'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react'

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
  status: string
  rejectionReason: string | null
  tenantId: string | null
  createdAt: string
  updatedAt: string
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [application, setApplication] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/agent/applications/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else setApplication(data)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load application')
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !application) {
    return (
      <div className="max-w-2xl mx-auto">
        <Link href="/agent/applications" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <p className="text-sm text-red-500">{error ?? 'Application not found'}</p>
      </div>
    )
  }

  const statusConfig: Record<string, { icon: typeof Clock; className: string; label: string }> = {
    PENDING: { icon: Clock, className: 'bg-amber-50 border-amber-200 text-amber-800', label: 'Pending Review' },
    APPROVED: { icon: CheckCircle, className: 'bg-emerald-50 border-emerald-200 text-emerald-800', label: 'Approved' },
    REJECTED: { icon: XCircle, className: 'bg-red-50 border-red-200 text-red-800', label: 'Rejected' },
    SUSPENDED: { icon: AlertCircle, className: 'bg-gray-50 border-gray-200 text-gray-800', label: 'Suspended' },
  }

  const cfg = statusConfig[application.status] ?? statusConfig.PENDING
  const Icon = cfg.icon

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/agent/applications" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ChevronLeft className="w-4 h-4" /> Back to Applications
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{application.businessName}</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Submitted {new Date(application.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Status */}
      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${cfg.className}`}>
        <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">{cfg.label}</p>
          {application.status === 'REJECTED' && application.rejectionReason && (
            <p className="text-xs mt-1">{application.rejectionReason}</p>
          )}
          {application.status === 'APPROVED' && application.tenantId && (
            <p className="text-xs mt-1">Tenant account created for the business owner.</p>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-800">Business Details</h2>
        <Row label="Type" value={application.businessType.charAt(0) + application.businessType.slice(1).toLowerCase()} />
        <Row label="Address" value={application.businessAddress} />
        {application.gpsLatitude && application.gpsLongitude && (
          <Row label="GPS" value={`${application.gpsLatitude}, ${application.gpsLongitude}`} />
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-800">Owner Details</h2>
        <Row label="Full Name" value={application.ownerFullName} />
        <Row label="Phone" value={application.ownerPhone} />
        <Row label="Email" value={application.ownerEmail} />
        {application.ownerGhanaCardNumber && (
          <Row label="Ghana Card" value={application.ownerGhanaCardNumber} />
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right max-w-xs">{value}</span>
    </div>
  )
}
