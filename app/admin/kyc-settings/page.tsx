'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { Shield, Building2, User, CheckCircle } from 'lucide-react'

type BooleanKYCKey =
  | 'requireBusinessRegNumber'
  | 'requireBusinessCertUpload'
  | 'requireDirectorGhanaCardNumber'
  | 'requireDirectorGhanaCardUpload'
  | 'requireAgentGhanaCardNumber'
  | 'requireAgentGhanaCardUpload'

interface KYCSettings {
  requireBusinessRegNumber: boolean
  requireBusinessCertUpload: boolean
  requireDirectorGhanaCardNumber: boolean
  requireDirectorGhanaCardUpload: boolean
  requireAgentGhanaCardNumber: boolean
  requireAgentGhanaCardUpload: boolean
  updatedAt: string | null
  updatedByEmail: string | null
}

const DEFAULT: KYCSettings = {
  requireBusinessRegNumber: false,
  requireBusinessCertUpload: false,
  requireDirectorGhanaCardNumber: true,
  requireDirectorGhanaCardUpload: false,
  requireAgentGhanaCardNumber: true,
  requireAgentGhanaCardUpload: false,
  updatedAt: null,
  updatedByEmail: null,
}

export default function KYCSettingsPage() {
  const [settings, setSettings] = useState<KYCSettings>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/kyc-settings')
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setSettings(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggle(key: BooleanKYCKey) {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
    setMessage(null)
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/kyc-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requireBusinessRegNumber: settings.requireBusinessRegNumber,
          requireBusinessCertUpload: settings.requireBusinessCertUpload,
          requireDirectorGhanaCardNumber: settings.requireDirectorGhanaCardNumber,
          requireDirectorGhanaCardUpload: settings.requireDirectorGhanaCardUpload,
          requireAgentGhanaCardNumber: settings.requireAgentGhanaCardNumber,
          requireAgentGhanaCardUpload: settings.requireAgentGhanaCardUpload,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Failed to save settings' })
      } else {
        setSettings(data)
        setMessage({ type: 'success', text: 'KYC settings saved.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent -full animate-spin" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KYC Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Control which identity documents are required during onboarding. The system follows a flexible
            Ghana-standard approach: agents and businesses can provide either a number or an upload.
          </p>
        </div>

        {message && (
          <div className={`text-sm px-4 py-3 border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-red-50 text-red-700 border-red-100'
          }`}>
            {message.text}
          </div>
        )}

        {/* Business KYC */}
        <SettingsSection
          title="Business Onboarding"
          icon={<Building2 className="w-4 h-4 text-indigo-500" />}
          description="Rules applied when an agent submits a new business application."
        >
          <Toggle
            label="Require Business Registration Number"
            description="If enabled, agents must enter the reg. number before submitting. Otherwise it is optional."
            checked={settings.requireBusinessRegNumber}
            onChange={() => toggle('requireBusinessRegNumber')}
          />
          <Toggle
            label="Require Business Certificate Upload"
            description="If enabled, agents must upload the certificate. Typically left off to keep onboarding simple."
            checked={settings.requireBusinessCertUpload}
            onChange={() => toggle('requireBusinessCertUpload')}
          />
          <Toggle
            label="Require Director Ghana Card Number"
            description="Recommended on. The director must provide their NIA card number."
            checked={settings.requireDirectorGhanaCardNumber}
            onChange={() => toggle('requireDirectorGhanaCardNumber')}
            recommended
          />
          <Toggle
            label="Require Director Ghana Card Upload"
            description="If enabled, the director must also upload a Ghana Card image, not just the number."
            checked={settings.requireDirectorGhanaCardUpload}
            onChange={() => toggle('requireDirectorGhanaCardUpload')}
          />
        </SettingsSection>

        {/* Agent KYC */}
        <SettingsSection
          title="Agent Registration"
          icon={<User className="w-4 h-4 text-indigo-500" />}
          description="Rules applied when a new agent self-registers or is registered by an admin."
        >
          <Toggle
            label="Require Agent Ghana Card Number"
            description="Recommended on. Every agent must provide their NIA card number."
            checked={settings.requireAgentGhanaCardNumber}
            onChange={() => toggle('requireAgentGhanaCardNumber')}
            recommended
          />
          <Toggle
            label="Require Agent Ghana Card Upload"
            description="If enabled, agents must also upload a card image (in addition to or instead of the number)."
            checked={settings.requireAgentGhanaCardUpload}
            onChange={() => toggle('requireAgentGhanaCardUpload')}
          />
        </SettingsSection>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Flexible Ghana-standard KYC
          </p>
          <p className="text-xs leading-relaxed">
            The platform never forces agents or businesses to provide <em>both</em> a registration number and a certificate,
            or <em>both</em> a Ghana Card number and an upload — unless you explicitly enable both rules above.
            This keeps onboarding simple for small businesses while still being compliant.
          </p>
        </div>

        {settings.updatedAt && (
          <p className="text-xs text-gray-400 text-right">
            Last updated {new Date(settings.updatedAt).toLocaleString()}
            {settings.updatedByEmail ? ` by ${settings.updatedByEmail}` : ''}
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent -full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}

function SettingsSection({
  title,
  icon,
  description,
  children,
}: {
  title: string
  icon: React.ReactNode
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          {icon}{title}
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  recommended,
}: {
  label: string
  description: string
  checked: boolean
  onChange: () => void
  recommended?: boolean
}) {
  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800">{label}</p>
          {recommended && (
            <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 -full">
              Recommended
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className={`shrink-0 w-11 h-6 -full transition-colors relative mt-0.5 ${
          checked ? 'bg-indigo-600' : 'bg-gray-200'
        }`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white -full shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
