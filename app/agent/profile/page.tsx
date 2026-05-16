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
  status: string
  approvedAt: string | null
  _count: { onboardedBusinesses: number }
}

export default function AgentProfilePage() {
  const { data: session, update: updateSession } = useSession()
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({ phone: '', residentialAddress: '', territory: '' })
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
        body: JSON.stringify(form),
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
    if (!file) return
    if (!cardNumber.trim()) {
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
          className={`text-sm px-4 py-3 rounded-lg border ${
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
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          profile.status === 'APPROVED'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}
      >
        {profile.status === 'APPROVED' ? (
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
        ) : (
          <Clock className="w-5 h-5 flex-shrink-0" />
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
              Upload your Ghana Card below to complete verification.
            </p>
          )}
        </div>
      </div>

      {/* Ghana Card section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Ghana Card (KYC)</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Ghana Card Number</label>
          <input
            type="text"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            placeholder="GHA-XXXXXXXXX-X"
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {profile.ghanaCardImageUrl && (
          <div className="relative w-full h-40 rounded-lg overflow-hidden border border-gray-200">
            <Image
              src={profile.ghanaCardImageUrl}
              alt="Ghana Card"
              fill
              className="object-contain"
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Choose image
          </button>
          <button
            type="button"
            onClick={handleCardUpload}
            disabled={uploadLoading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {uploadLoading ? 'Uploading…' : 'Upload Card'}
          </button>
        </div>
      </div>

      {/* Contact details */}
      <form onSubmit={handleProfileSave} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Contact Details</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input
              disabled
              value={profile.fullName}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              disabled
              value={profile.email}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Territory</label>
            <input
              value={form.territory}
              onChange={(e) => setForm((p) => ({ ...p, territory: e.target.value }))}
              placeholder="e.g. Greater Accra"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Residential Address</label>
          <input
            value={form.residentialAddress}
            onChange={(e) => setForm((p) => ({ ...p, residentialAddress: e.target.value }))}
            placeholder="e.g. Kasoa, Central Region"
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
