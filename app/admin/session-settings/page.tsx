'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { Timer, Clock, CheckCircle, Info } from 'lucide-react'

interface Settings {
  idleTimeoutMinutes: number
  sessionMaxHours: number
  updatedAt?: string | null
  updatedByEmail?: string | null
}

const DEFAULTS: Settings = { idleTimeoutMinutes: 5, sessionMaxHours: 4 }

export default function SessionSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [form, setForm] = useState<Settings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/session-settings')
      .then(r => r.json())
      .then(data => {
        if (!data.error) { setSettings(data); setForm(data) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/session-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idleTimeoutMinutes: form.idleTimeoutMinutes,
          sessionMaxHours: form.sessionMaxHours,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Failed to save settings' })
      } else {
        setSettings(data)
        setForm(data)
        setMessage({ type: 'success', text: 'Session settings saved successfully.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const isDirty =
    form.idleTimeoutMinutes !== settings.idleTimeoutMinutes ||
    form.sessionMaxHours !== settings.sessionMaxHours

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

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Control how long users stay logged in and when they are automatically signed out.
            Changes take effect for all new logins immediately.
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

        {/* Idle Timeout */}
        <Section
          icon={<Timer className="w-4 h-4 text-indigo-500" />}
          title="Idle Timeout"
          description="Sign users out automatically after a period of no mouse, keyboard, or touch activity. A warning is shown 60 seconds before sign-out."
        >
          <div className="px-5 py-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-800">
                  Idle timeout duration
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  How many minutes of inactivity before the user is signed out. Range: 1 – 60 minutes.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.idleTimeoutMinutes}
                  onChange={e => setForm(f => ({ ...f, idleTimeoutMinutes: Math.min(60, Math.max(1, Number(e.target.value))) }))}
                  className="w-20 px-3 py-2 text-sm text-center border border-gray-200 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 font-semibold"
                />
                <span className="text-sm text-gray-500">min</span>
              </div>
            </div>
            <PreviewBar
              value={form.idleTimeoutMinutes}
              max={60}
              label={`${form.idleTimeoutMinutes} min idle → sign out`}
              color="bg-amber-400"
            />
          </div>
        </Section>

        {/* Session Max */}
        <Section
          icon={<Clock className="w-4 h-4 text-indigo-500" />}
          title="Maximum Session Duration"
          description="Force sign-out this many hours after login, regardless of activity. The user cannot stay logged in beyond this limit even if they are actively using the system."
        >
          <div className="px-5 py-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-800">
                  Absolute session limit
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Hours from login until forced sign-out. Range: 1 – 24 hours.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={form.sessionMaxHours}
                  onChange={e => setForm(f => ({ ...f, sessionMaxHours: Math.min(24, Math.max(1, Number(e.target.value))) }))}
                  className="w-20 px-3 py-2 text-sm text-center border border-gray-200 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 font-semibold"
                />
                <span className="text-sm text-gray-500">hrs</span>
              </div>
            </div>
            <PreviewBar
              value={form.sessionMaxHours}
              max={24}
              label={`${form.sessionMaxHours} hr${form.sessionMaxHours !== 1 ? 's' : ''} max session`}
              color="bg-indigo-500"
            />
          </div>
        </Section>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Info className="w-4 h-4" /> How these work together
          </p>
          <ul className="text-xs leading-relaxed space-y-1 list-disc pl-4">
            <li>
              <strong>Idle timeout</strong> — a countdown starts when the user stops interacting. Any click, key press, or touch resets it. After {form.idleTimeoutMinutes} min of silence, the user is signed out.
            </li>
            <li>
              <strong>Session limit</strong> — a hard clock that starts at login and never resets. After {form.sessionMaxHours} hour{form.sessionMaxHours !== 1 ? 's' : ''} the session is forcibly expired on both the client and the server.
            </li>
            <li>
              Changes apply to <strong>new logins only</strong>. Existing sessions use the values that were active when they logged in.
            </li>
          </ul>
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
            disabled={saving || !isDirty}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
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

function Section({
  icon, title, description, children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">{icon}{title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  )
}

function PreviewBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div>
      <div className="h-1.5 w-full bg-gray-100 overflow-hidden">
        <div className={`h-1.5 ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  )
}
