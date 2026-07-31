'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, AlertCircle, CheckCircle, Clock, Upload, XCircle, FileText } from 'lucide-react'

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
  createdAt: string
  updatedAt: string
  documents: Document[]
}

interface KYCSettings {
  requireBusinessCertUpload: boolean
  requireDirectorGhanaCardUpload: boolean
}

const DOC_LABEL: Record<string, string> = {
  BUSINESS_CERTIFICATE: 'Business Certificate',
  GHANA_CARD_FRONT: 'Ghana Card (Front)',
  GHANA_CARD_BACK: 'Ghana Card (Back)',
  OTHER: 'Document',
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [application, setApplication] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kyc, setKyc] = useState<KYCSettings>({
    requireBusinessCertUpload: false,
    requireDirectorGhanaCardUpload: false,
  })
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [businessCertFile, setBusinessCertFile] = useState<File | null>(null)
  const [directorCardFile, setDirectorCardFile] = useState<File | null>(null)
  const businessCertRef = useRef<HTMLInputElement>(null)
  const directorCardRef = useRef<HTMLInputElement>(null)

  async function loadApplication() {
    const response = await fetch(`/api/agent/applications/${id}`)
    const data = await response.json()

    if (data.error) {
      setApplication(null)
      setError(data.error)
    } else {
      setApplication(data)
      setError(null)
    }
  }

  useEffect(() => {
    Promise.all([
      loadApplication(),
      fetch('/api/agent/kyc-settings')
        .then((response) => response.json())
        .then((data) => {
          if (typeof data.requireBusinessCertUpload === 'boolean') {
            setKyc({
              requireBusinessCertUpload: data.requireBusinessCertUpload,
              requireDirectorGhanaCardUpload: data.requireDirectorGhanaCardUpload ?? false,
            })
          }
        })
        .catch(() => {
          // Keep permissive defaults if the public settings request fails.
        }),
    ])
      .catch(() => {
        setError('Failed to load application')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [id])

  async function uploadDocument(params: {
    file: File | null
    documentType: string
    label: string
  }) {
    const { file, documentType, label } = params
    if (!file) {
      setUploadMessage({ type: 'error', text: `Choose a file before uploading ${label}.` })
      return
    }

    setUploadingDoc(documentType)
    setUploadMessage(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('documentType', documentType)
    formData.append('label', label)

    try {
      const response = await fetch(`/api/agent/applications/${id}/upload-document`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (!response.ok) {
        setUploadMessage({ type: 'error', text: data.error ?? `Failed to upload ${label}.` })
        return
      }

      if (documentType === 'BUSINESS_CERTIFICATE') {
        setBusinessCertFile(null)
        if (businessCertRef.current) businessCertRef.current.value = ''
      } else if (documentType === 'GHANA_CARD_FRONT') {
        setDirectorCardFile(null)
        if (directorCardRef.current) directorCardRef.current.value = ''
      }

      await loadApplication()
      setUploadMessage({ type: 'success', text: `${label} uploaded successfully.` })
    } catch {
      setUploadMessage({ type: 'error', text: `Failed to upload ${label}.` })
    } finally {
      setUploadingDoc(null)
    }
  }

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
    PENDING:   { icon: Clock,        className: 'bg-amber-50 border-amber-200 text-amber-800',   label: 'Pending Review' },
    APPROVED:  { icon: CheckCircle,  className: 'bg-emerald-50 border-emerald-200 text-emerald-800', label: 'Approved' },
    REJECTED:  { icon: XCircle,      className: 'bg-red-50 border-red-200 text-red-800',         label: 'Rejected' },
    SUSPENDED: { icon: AlertCircle,  className: 'bg-gray-50 border-gray-200 text-gray-800',      label: 'Suspended' },
  }

  const cfg = statusConfig[application.status] ?? statusConfig.PENDING
  const Icon = cfg.icon

  const directors: Director[] = Array.isArray(application.directors) ? application.directors : []
  const hasBusinessCertificate = application.documents.some(
    (document) => document.documentType === 'BUSINESS_CERTIFICATE'
  )
  const hasDirectorCardUpload = application.documents.some(
    (document) => document.documentType === 'GHANA_CARD_FRONT'
  )
  const missingRequiredDocs: string[] = []

  if (kyc.requireBusinessCertUpload && !hasBusinessCertificate) {
    missingRequiredDocs.push('Business certificate upload')
  }

  if (kyc.requireDirectorGhanaCardUpload && !hasDirectorCardUpload) {
    missingRequiredDocs.push('Director Ghana Card upload')
  }

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

      {/* Status banner */}
      <div className={`flex items-start gap-3 px-4 py-3 border ${cfg.className}`}>
        <Icon className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">{cfg.label}</p>
          {application.status === 'REJECTED' && application.rejectionReason && (
            <p className="text-xs mt-1">{application.rejectionReason}</p>
          )}
          {application.status === 'APPROVED' && application.approvalNote && (
            <p className="text-xs mt-1">{application.approvalNote}</p>
          )}
          {application.status === 'APPROVED' && application.tenantId && (
            <p className="text-xs mt-1">Business account has been created and login details sent.</p>
          )}
        </div>
      </div>

      {uploadMessage && (
        <div
          className={`text-sm px-4 py-3 border ${
            uploadMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-red-50 text-red-700 border-red-100'
          }`}
        >
          {uploadMessage.text}
        </div>
      )}

      {application.status === 'PENDING' && missingRequiredDocs.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 p-4 text-sm text-amber-700">
          Required before approval: {missingRequiredDocs.join(', ')}.
        </div>
      )}

      {/* Business details */}
      <div className="bg-white border border-gray-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">Business Details</h2>
        <Row label="Type" value={application.businessType.charAt(0) + application.businessType.slice(1).toLowerCase()} />
        <Row label="Address" value={application.businessAddress} />
        {application.businessRegistrationNumber && (
          <Row label="Registration Number" value={application.businessRegistrationNumber} />
        )}
        {application.businessPhone && <Row label="Phone" value={application.businessPhone} />}
        {application.businessEmail && <Row label="Email" value={application.businessEmail} />}
        {application.gpsLatitude && application.gpsLongitude && (
          <Row label="GPS" value={`${application.gpsLatitude}, ${application.gpsLongitude}`} />
        )}
      </div>

      {/* Directors */}
      <div className="bg-white border border-gray-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">
          Directors / Owners ({directors.length})
        </h2>
        {directors.length === 0 ? (
          <p className="text-sm text-gray-400">No directors listed.</p>
        ) : (
          directors.map((d, i) => (
            <div key={i} className="flex items-start justify-between text-sm py-1.5 border-t border-gray-50 first:border-0 first:pt-0">
              <div>
                <p className="font-medium text-gray-900">{d.fullName}</p>
                {d.ghanaCardNumber && (
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{d.ghanaCardNumber}</p>
                )}
              </div>
              {i === 0 && (
                <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full shrink-0 ml-3">
                  Primary
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Documents */}
      {application.documents.length > 0 && (
        <div className="bg-white border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-500" />
            KYC Documents ({application.documents.length})
          </h2>
          {application.documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3">
              {doc.fileUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
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
                  {doc.label ?? DOC_LABEL[doc.documentType] ?? doc.documentType}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                </p>
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:underline mt-0.5 inline-block"
                >
                  View →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {application.status === 'PENDING' && (
        <div className="bg-white border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-500" />
            Upload / Retry Documents
          </h2>

          <UploadRow
            label={
              kyc.requireBusinessCertUpload
                ? 'Business Certificate'
                : 'Business Certificate, if available'
            }
            helper={
              hasBusinessCertificate
                ? 'A business certificate has already been uploaded. Upload again to replace it.'
                : kyc.requireBusinessCertUpload
                  ? 'Required before this application can be approved.'
                  : 'Optional supporting document.'
            }
            file={businessCertFile}
            inputRef={businessCertRef}
            accept="image/*,.pdf"
            buttonLabel={uploadingDoc === 'BUSINESS_CERTIFICATE' ? 'Uploading…' : 'Upload certificate'}
            disabled={uploadingDoc !== null}
            onChange={setBusinessCertFile}
            onUpload={() =>
              uploadDocument({
                file: businessCertFile,
                documentType: 'BUSINESS_CERTIFICATE',
                label: 'Business Certificate',
              })
            }
          />

          <UploadRow
            label={
              kyc.requireDirectorGhanaCardUpload
                ? 'Director Ghana Card'
                : 'Director Ghana Card, if available'
            }
            helper={
              hasDirectorCardUpload
                ? 'A director Ghana Card has already been uploaded. Upload again to replace it.'
                : kyc.requireDirectorGhanaCardUpload
                  ? 'Required before this application can be approved.'
                  : 'Optional if the Ghana Card number is already on the application.'
            }
            file={directorCardFile}
            inputRef={directorCardRef}
            accept="image/*"
            buttonLabel={uploadingDoc === 'GHANA_CARD_FRONT' ? 'Uploading…' : 'Upload Ghana Card'}
            disabled={uploadingDoc !== null}
            onChange={setDirectorCardFile}
            onUpload={() =>
              uploadDocument({
                file: directorCardFile,
                documentType: 'GHANA_CARD_FRONT',
                label: 'Director Ghana Card',
              })
            }
          />
        </div>
      )}

      {application.documents.length === 0 && application.status === 'PENDING' && !missingRequiredDocs.length && (
        <div className="bg-amber-50 border border-amber-100 p-4 text-sm text-amber-700">
          No documents uploaded yet. They are optional for this application, but adding them can speed up review.
        </div>
      )}
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

function UploadRow({
  label,
  helper,
  file,
  inputRef,
  accept,
  buttonLabel,
  disabled,
  onChange,
  onUpload,
}: {
  label: string
  helper: string
  file: File | null
  inputRef: React.RefObject<HTMLInputElement | null>
  accept: string
  buttonLabel: string
  disabled: boolean
  onChange: (file: File | null) => void
  onUpload: () => void
}) {
  return (
    <div className="border border-gray-100 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-1">{helper}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-4 py-2 border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
        >
          {file ? 'Change file' : 'Choose file'}
        </button>
        {file && <span className="text-sm text-gray-500">{file.name}</span>}
        <button
          type="button"
          onClick={onUpload}
          disabled={disabled}
          className="px-4 py-2 bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}
