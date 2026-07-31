'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { ChevronLeft, CheckCircle, XCircle, Clock, FileText } from 'lucide-react'
import Image from 'next/image'

interface Director {
  fullName: string
  ghanaCardNumber?: string
}

interface Document {
  id: string
  documentType: string
  label: string | null
  fileUrl: string
  uploadedAt: string
}

interface Application {
  id: string
  businessName: string
  businessType: string
  businessRegistrationNumber: string | null
  businessAddress: string
  businessPhone: string | null
  businessEmail: string | null
  gpsLatitude: number | null
  gpsLongitude: number | null
  directors: Director[]
  ownerFullName: string
  ownerPhone: string
  ownerEmail: string
  ownerGhanaCardNumber: string | null
  ownerGhanaCardImageUrl: string | null
  status: string
  rejectionReason: string | null
  approvalNote: string | null
  tenantId: string | null
  reviewedById: string | null
  reviewedAt: string | null
  createdAt: string
  documents: Document[]
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
  const [approvalNote, setApprovalNote] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function load() {
    fetch(`/api/admin/applications/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setApplication(data?.id ? data : null)
        setApprovalNote(data?.approvalNote ?? '')
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
        ...(action === 'approve' ? { approvalNote: approvalNote.trim() || undefined } : {}),
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
            className={`text-sm px-4 py-3 border ${
              result.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                : 'bg-red-50 text-red-700 border-red-100'
            }`}
          >
            {result.text}
          </div>
        )}

        {application.rejectionReason && (
          <div className="bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            <span className="font-medium">Rejection reason:</span> {application.rejectionReason}
          </div>
        )}

        {application.approvalNote && application.status === 'APPROVED' && (
          <div className="bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">
            <span className="font-medium">Approval note:</span> {application.approvalNote}
          </div>
        )}

        {/* Agent */}
        <div className="bg-white border border-gray-200 p-6 space-y-3">
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
        <div className="bg-white border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Business Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Row label="Type" value={application.businessType.charAt(0) + application.businessType.slice(1).toLowerCase()} />
            <Row label="Address" value={application.businessAddress} />
            {application.businessRegistrationNumber && (
              <Row label="Registration No." value={application.businessRegistrationNumber} />
            )}
            {application.businessPhone && <Row label="Phone" value={application.businessPhone} />}
            {application.businessEmail && <Row label="Email" value={application.businessEmail} />}
            {application.gpsLatitude && (
              <Row label="GPS" value={`${application.gpsLatitude}, ${application.gpsLongitude}`} />
            )}
          </div>
        </div>

        {/* Directors */}
        {(() => {
          const directors: Director[] = Array.isArray(application.directors) ? application.directors : []
          return directors.length > 0 ? (
            <div className="bg-white border border-gray-200 p-6 space-y-3">
              <h2 className="text-sm font-semibold text-gray-800">Directors / Owners</h2>
              {directors.map((d, i) => (
                <div key={i} className="flex items-start justify-between text-sm border-t border-gray-50 pt-2 first:border-0 first:pt-0">
                  <div>
                    <p className="font-medium text-gray-900">{d.fullName}</p>
                    {d.ghanaCardNumber && (
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{d.ghanaCardNumber}</p>
                    )}
                  </div>
                  {i === 0 && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full shrink-0 ml-3">
                      Primary
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Fallback to legacy owner fields when directors array is empty
            <div className="bg-white border border-gray-200 p-6 space-y-4">
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
          )
        })()}

        {/* KYC Documents */}
        {application.documents.length > 0 && (
          <div className="bg-white border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              KYC Documents ({application.documents.length})
            </h2>
            {application.documents.map((doc) => {
              const isImage = doc.fileUrl.match(/\.(jpg|jpeg|png|webp)/i)
              const labelMap: Record<string, string> = {
                BUSINESS_CERTIFICATE: 'Business Certificate',
                GHANA_CARD_FRONT: 'Ghana Card (Front)',
                GHANA_CARD_BACK: 'Ghana Card (Back)',
                OTHER: 'Document',
              }
              return (
                <div key={doc.id} className="flex items-center gap-3">
                  {isImage ? (
                    <div className="relative w-24 h-16 overflow-hidden border border-gray-200 shrink-0">
                      {/* unoptimized: served from the authenticated /api/files route */}
                      <Image src={doc.fileUrl} alt={doc.label ?? doc.documentType} fill unoptimized className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-24 h-16 border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
                      <FileText className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {doc.label ?? labelMap[doc.documentType] ?? doc.documentType}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline mt-0.5 inline-block">
                      View →
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Actions (only for PENDING) */}
        {isPending && (
          <div className="bg-white border border-gray-200 p-6 space-y-4">
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
                className="w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Approval note (optional, shown to the business owner)
              </label>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                rows={3}
                placeholder="e.g. Approved after confirming all registration documents."
                className="w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleAction('approve')}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Processing…' : 'Approve & Create Tenant'}
              </button>
              <button
                onClick={() => handleAction('reject')}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {application.tenantId && (
          <div className="bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-800">
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
