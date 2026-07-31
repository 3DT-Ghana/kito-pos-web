'use client'

import { useEffect, useState, FormEvent, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Upload, CheckCircle, Clock } from 'lucide-react'
import Image from 'next/image'

interface AgentProfile {
  id: string
  agentCode: string
  fullName: string
  phone: string
  email: string
  ghanaCardNumber: string | null
  ghanaCardImageUrl: string | null
  residentialAddress: string | null
  territory: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  status: string
  approvedAt: string | null
  _count: { onboardedBusinesses: number }
  kycRequirements: {
    requireAgentGhanaCardNumber: boolean
    requireAgentGhanaCardUpload: boolean
  }
}

export default function AgentProfilePage() {
  const { data: session, update: updateSession } = useSession()
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({ phone: '', residentialAddress: '', territory: '', emergencyContactName: '', emergencyContactPhone: '' })
  const [cardNumber, setCardNumber] = useState('')

  useEffect(() => {
    fetch('/api/agent/profile')
      .then((r) => r.json())
      .then(async (data) => {
        setProfile(data)
        setForm({
          phone: data.phone ?? '',
          residentialAddress: data.residentialAddress ?? '',
          territory: data.territory ?? '',
          emergencyContactName: data.emergencyContactName ?? '',
          emergencyContactPhone: data.emergencyContactPhone ?? '',
        })
        setCardNumber(data.ghanaCardNumber ?? '')
        if (data?.status && data.status !== session?.user.agentStatus) {
          await updateSession()
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session?.user.agentStatus, updateSession])

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/agent/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ghanaCardNumber: cardNumber || null,
          emergencyContactName: form.emergencyContactName || null,
          emergencyContactPhone: form.emergencyContactPhone || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Failed to save' })
      } else {
        setProfile((prev) => prev ? { ...prev, ...data } : prev)
        setMessage({ type: 'success', text: 'Profile saved.' })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleCardUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !profile) return
    if (
      profile.kycRequirements.requireAgentGhanaCardNumber &&
      !cardNumber.trim() &&
      !profile.ghanaCardNumber
    ) {
      setMessage({ type: 'error', text: 'Please enter your Ghana Card number first.' })
      return
    }

    setUploadLoading(true)
    setMessage(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('ghanaCardNumber', cardNumber.trim())

    try {
      const res = await fetch('/api/agent/upload-ghana-card', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Upload failed' })
      } else {
        setProfile((prev) => prev ? { ...prev, ...data } : prev)
        setMessage({ type: 'success', text: 'Ghana Card uploaded successfully.' })
        await updateSession()
      }
    } finally {
      setUploadLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return <p className="text-sm text-red-500">Failed to load profile.</p>
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Agent code: {profile.agentCode}</p>
      </div>

      {message && (
        <div
          className={`text-sm px-4 py-3 border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-red-50 text-red-700 border-red-100'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Status banner */}
      <div
        className={`flex items-center gap-3 px-4 py-3 border ${
          profile.status === 'APPROVED'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}
      >
        {profile.status === 'APPROVED' ? (
          <CheckCircle className="w-5 h-5 shrink-0" />
        ) : (
          <Clock className="w-5 h-5 shrink-0" />
        )}
        <div>
          <p className="text-sm font-medium">
            Status: {profile.status.charAt(0) + profile.status.slice(1).toLowerCase()}
          </p>
          {profile.approvedAt && (
            <p className="text-xs mt-0.5">
              Approved on {new Date(profile.approvedAt).toLocaleDateString()}
            </p>
          )}
          {profile.status === 'PENDING' && (
            <p className="text-xs mt-0.5">
              {profile.kycRequirements.requireAgentGhanaCardUpload
                ? 'A Ghana Card image is required before your account can be approved.'
                : profile.kycRequirements.requireAgentGhanaCardNumber && !profile.ghanaCardNumber
                  ? 'Enter your Ghana Card number below to complete verification.'
                  : 'Upload your Ghana Card below if the admin asks for it during review.'}
            </p>
          )}
        </div>
      </div>

      {/* Ghana Card section */}
      <div className="bg-white border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Ghana Card (KYC)</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {profile.kycRequirements.requireAgentGhanaCardNumber
              ? 'Ghana Card Number'
              : 'Ghana Card Number, if available'}
            {profile.kycRequirements.requireAgentGhanaCardNumber && (
              <span className="text-red-500 ml-0.5">*</span>
            )}
          </label>
          <input
            type="text"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            placeholder={
              profile.kycRequirements.requireAgentGhanaCardNumber
                ? 'GHA-XXXXXXXXX-X'
                : 'GHA-XXXXXXXXX-X (optional)'
            }
            className="w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            {profile.kycRequirements.requireAgentGhanaCardNumber
              ? 'Required by the current KYC settings.'
              : 'Optional unless an administrator requests it.'}
          </p>
        </div>

        {profile.ghanaCardImageUrl && (
          <div className="relative w-full h-40 overflow-hidden border border-gray-200">
            {/* unoptimized: served from the authenticated /api/files route */}
            <Image
              src={profile.ghanaCardImageUrl}
              alt="Ghana Card"
              fill
              unoptimized
              className="object-contain"
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 border border-gray-300 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Choose image
          </button>
          <button
            type="button"
            onClick={handleCardUpload}
            disabled={uploadLoading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {uploadLoading ? 'Uploading…' : 'Upload Card'}
          </button>
        </div>
        <p className="text-xs text-gray-400">
          {profile.kycRequirements.requireAgentGhanaCardUpload
            ? 'This upload is required before approval.'
            : 'This upload is optional but can speed up the review.'}
        </p>
      </div>

      {/* Contact details */}
      <form onSubmit={handleProfileSave} className="bg-white border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Contact Details</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input
              disabled
              value={profile.fullName}
              className="w-full px-3.5 py-2.5 border border-gray-200 text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              disabled
              value={profile.email}
              className="w-full px-3.5 py-2.5 border border-gray-200 text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Territory</label>
            <input
              value={form.territory}
              onChange={(e) => setForm((p) => ({ ...p, territory: e.target.value }))}
              placeholder="e.g. Greater Accra"
              className="w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Residential Address</label>
          <input
            value={form.residentialAddress}
            onChange={(e) => setForm((p) => ({ ...p, residentialAddress: e.target.value }))}
            placeholder="e.g. Kasoa, Central Region"
            className="w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Emergency Contact</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Name</label>
              <input
                value={form.emergencyContactName}
                onChange={(e) => setForm((p) => ({ ...p, emergencyContactName: e.target.value }))}
                placeholder="e.g. Jane Doe"
                className="w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Phone</label>
              <input
                value={form.emergencyContactPhone}
                onChange={(e) => setForm((p) => ({ ...p, emergencyContactPhone: e.target.value }))}
                placeholder="e.g. 0241234567"
                className="w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
