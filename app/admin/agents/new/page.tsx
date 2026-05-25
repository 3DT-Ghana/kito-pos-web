'use client'

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { ChevronLeft, User, Phone, Mail, Lock, MapPin, Shield, Users, CheckCircle } from 'lucide-react'

interface KYCSettings {
  requireAgentGhanaCardNumber: boolean
  requireAgentGhanaCardUpload: boolean
}

interface FormData {
  fullName: string
  phone: string
  email: string
  password: string
  residentialAddress: string
  territory: string
  ghanaCardNumber: string
  emergencyContactName: string
  emergencyContactPhone: string
  status: 'APPROVED' | 'PENDING'
}

export default function AdminRegisterAgentPage() {
  const [kyc, setKyc] = useState<KYCSettings>({
    requireAgentGhanaCardNumber: true,
    requireAgentGhanaCardUpload: false,
  })
  const [form, setForm] = useState<FormData>({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    residentialAddress: '',
    territory: '',
    ghanaCardNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    status: 'APPROVED',
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ agentCode: string; fullName: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/admin/kyc-settings')
      .then((response) => response.json())
      .then((data) => {
        if (typeof data.requireAgentGhanaCardNumber === 'boolean') {
          setKyc({
            requireAgentGhanaCardNumber: data.requireAgentGhanaCardNumber,
            requireAgentGhanaCardUpload: data.requireAgentGhanaCardUpload ?? false,
          })
          if (data.requireAgentGhanaCardUpload) {
            setForm((prev) => ({ ...prev, status: 'PENDING' }))
          }
        }
      })
      .catch(() => {
        // Keep secure defaults if settings cannot be loaded.
      })
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (kyc.requireAgentGhanaCardNumber && !form.ghanaCardNumber.trim()) {
      setError('Ghana Card Number is required by the current KYC settings.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/admin/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Registration failed')
        return
      }

      setSuccess({ agentCode: data.agentCode, fullName: data.fullName })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AdminLayout>
        <div className="max-w-lg mx-auto text-center space-y-5 py-16">
          <div className="w-16 h-16 -full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Agent Registered</h2>
            <p className="text-sm text-gray-500 mt-1">
              <strong>{success.fullName}</strong> has been registered as <span className="font-mono font-semibold text-indigo-600">{success.agentCode}</span>
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <Link
              href="/admin/agents"
              className="px-5 py-2.5 border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back to Agents
            </Link>
            <button
              onClick={() => {
                setSuccess(null)
                setForm({
                  fullName: '', phone: '', email: '', password: '',
                  residentialAddress: '', territory: '', ghanaCardNumber: '',
                  emergencyContactName: '', emergencyContactPhone: '',
                  status: kyc.requireAgentGhanaCardUpload ? 'PENDING' : 'APPROVED',
                })
              }}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Register Another
            </button>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Link href="/admin/agents" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
            <ChevronLeft className="w-4 h-4" /> Back to Agents
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Register New Agent</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create an agent account directly from the admin panel</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Personal Details */}
          <Section title="Personal Details" icon={<User className="w-4 h-4 text-indigo-500" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <InputWithIcon icon={<User className="w-4 h-4" />}>
                  <input name="fullName" value={form.fullName} onChange={handleChange} required
                    placeholder="John Kwame Asante" className={inputCls} />
                </InputWithIcon>
              </Field>
              <Field label="Phone Number" required>
                <InputWithIcon icon={<Phone className="w-4 h-4" />}>
                  <input name="phone" value={form.phone} onChange={handleChange} required
                    placeholder="+233 24 000 0000" className={inputCls} />
                </InputWithIcon>
              </Field>
              <Field label="Email Address" required>
                <InputWithIcon icon={<Mail className="w-4 h-4" />}>
                  <input type="email" name="email" value={form.email} onChange={handleChange} required
                    placeholder="agent@example.com" className={inputCls} />
                </InputWithIcon>
              </Field>
              <Field label="Initial Password" required helper="Agent should change this after first login">
                <InputWithIcon icon={<Lock className="w-4 h-4" />}>
                  <input type="password" name="password" value={form.password} onChange={handleChange} required
                    placeholder="Min. 8 characters" className={inputCls} />
                </InputWithIcon>
              </Field>
            </div>
            <Field label="Residential Address">
              <InputWithIcon icon={<MapPin className="w-4 h-4" />}>
                <input name="residentialAddress" value={form.residentialAddress} onChange={handleChange}
                  placeholder="e.g. Kasoa, Central Region" className={inputCls} />
              </InputWithIcon>
            </Field>
            <Field label="Territory / Region" helper="Area the agent will be covering">
              <InputWithIcon icon={<MapPin className="w-4 h-4" />}>
                <input name="territory" value={form.territory} onChange={handleChange}
                  placeholder="e.g. Greater Accra" className={inputCls} />
              </InputWithIcon>
            </Field>
          </Section>

          {/* KYC */}
          <Section title="Identity Verification (KYC)" icon={<Shield className="w-4 h-4 text-indigo-500" />}>
            <Field
              label={
                kyc.requireAgentGhanaCardNumber
                  ? 'Ghana Card Number'
                  : 'Ghana Card Number, if available'
              }
              required={kyc.requireAgentGhanaCardNumber}
              helper="National ID number (GHA-XXXXXXXXX-X)"
            >
              <InputWithIcon icon={<Shield className="w-4 h-4" />}>
                <input name="ghanaCardNumber" value={form.ghanaCardNumber} onChange={handleChange}
                  placeholder={kyc.requireAgentGhanaCardNumber ? 'GHA-XXXXXXXXX-X' : 'GHA-XXXXXXXXX-X (optional)'} className={inputCls} />
              </InputWithIcon>
            </Field>
            <div className="bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
              {kyc.requireAgentGhanaCardUpload
                ? 'A Ghana Card image is required before approval. After account creation, the agent must upload it from their profile before you can approve the account.'
                : 'Ghana Card image upload is available on the agent&apos;s profile page after account creation.'}
            </div>
          </Section>

          {/* Emergency Contact */}
          <Section title="Emergency Contact" icon={<Users className="w-4 h-4 text-indigo-500" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Contact Name">
                <InputWithIcon icon={<User className="w-4 h-4" />}>
                  <input name="emergencyContactName" value={form.emergencyContactName} onChange={handleChange}
                    placeholder="e.g. Abena Asante" className={inputCls} />
                </InputWithIcon>
              </Field>
              <Field label="Contact Phone">
                <InputWithIcon icon={<Phone className="w-4 h-4" />}>
                  <input name="emergencyContactPhone" value={form.emergencyContactPhone} onChange={handleChange}
                    placeholder="+233 20 000 0000" className={inputCls} />
                </InputWithIcon>
              </Field>
            </div>
          </Section>

          {/* Account Status */}
          <Section title="Account Status" icon={<CheckCircle className="w-4 h-4 text-indigo-500" />}>
            <Field
              label="Initial Status"
              helper={
                kyc.requireAgentGhanaCardUpload
                  ? 'Approval is disabled until the required Ghana Card image has been uploaded.'
                  : 'Approved agents can log in and onboard businesses immediately'
              }
            >
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className={inputCls}
              >
                <option value="APPROVED" disabled={kyc.requireAgentGhanaCardUpload}>
                  Approved — Active immediately
                </option>
                <option value="PENDING">Pending — Requires review</option>
              </select>
            </Field>
            {kyc.requireAgentGhanaCardUpload && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2">
                The current KYC settings require an image upload, so this new account should stay pending until the agent uploads their Ghana Card.
              </p>
            )}
          </Section>

          <div className="flex justify-end gap-3 pt-2">
            <Link href="/admin/agents"
              className="px-5 py-2.5 border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={loading}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {loading ? 'Registering…' : 'Register Agent'}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}

const inputCls =
  'w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        {icon}{title}
      </h2>
      {children}
    </div>
  )
}

function Field({ label, required, helper, children }: {
  label: string; required?: boolean; helper?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {helper && <p className="text-xs text-gray-400 mt-1">{helper}</p>}
    </div>
  )
}

function InputWithIcon({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
      <div className="[&_input]:pl-9 [&_select]:pl-9">{children}</div>
    </div>
  )
}
