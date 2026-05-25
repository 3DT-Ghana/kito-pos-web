'use client'

import { useState } from 'react'
import { Timer, Clock, CheckCircle, Info, Loader2 } from 'lucide-react'

interface Props {
  initialIdleTimeoutMinutes: number
  initialSessionMaxHours: number
  updatedAt?: string | null
}

export function SessionSettings({ initialIdleTimeoutMinutes, initialSessionMaxHours, updatedAt }: Props) {
  const [form, setForm] = useState({
    idleTimeoutMinutes: initialIdleTimeoutMinutes,
    sessionMaxHours:    initialSessionMaxHours,
  })
  const [saved, setSaved] = useState({
    idleTimeoutMinutes: initialIdleTimeoutMinutes,
    sessionMaxHours:    initialSessionMaxHours,
  })
  const [saving, setSaving]   = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(updatedAt ?? null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const isDirty =
    form.idleTimeoutMinutes !== saved.idleTimeoutMinutes ||
    form.sessionMaxHours    !== saved.sessionMaxHours

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Failed to save settings.' })
      } else {
        setSaved({ idleTimeoutMinutes: data.idleTimeoutMinutes, sessionMaxHours: data.sessionMaxHours })
        setLastSaved(data.updatedAt ?? null)
        setMessage({ type: 'success', text: 'Session settings saved. Changes apply to new logins.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white shadow-sm border-2 border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Session &amp; Security</h2>
        <p className="text-sm text-gray-500 mt-1">
          Control how long staff stay logged in. Changes apply to <strong>new logins</strong> immediately.
        </p>
      </div>

      {message && (
        <div className={`text-sm px-4 py-3 border ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Idle Timeout */}
      <div className="border border-gray-200 divide-y divide-gray-100">
        <div className="flex items-start gap-3 px-5 py-4 bg-gray-50">
          <Timer className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-800">Idle Timeout</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Sign users out after this many minutes of no keyboard, mouse, or touch activity. A 60-second warning is shown before sign-out.
            </p>
          </div>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="h-1.5 w-full bg-gray-100 overflow-hidden rounded-full">
              <div
                className="h-1.5 bg-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((form.idleTimeoutMinutes / 60) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {form.idleTimeoutMinutes} min idle → auto sign-out
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="number"
              min={1}
              max={60}
              value={form.idleTimeoutMinutes}
              onChange={e => setForm(f => ({
                ...f,
                idleTimeoutMinutes: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
              }))}
              className="w-20 px-3 py-2 text-sm text-center border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 font-semibold"
            />
            <span className="text-sm text-gray-500 w-6">min</span>
          </div>
        </div>
      </div>

      {/* Session Max */}
      <div className="border border-gray-200 divide-y divide-gray-100">
        <div className="flex items-start gap-3 px-5 py-4 bg-gray-50">
          <Clock className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-800">Maximum Session Duration</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Force sign-out this many hours after login, regardless of activity. Staff cannot stay logged in beyond this limit.
            </p>
          </div>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="h-1.5 w-full bg-gray-100 overflow-hidden rounded-full">
              <div
                className="h-1.5 bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((form.sessionMaxHours / 24) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {form.sessionMaxHours} hr{form.sessionMaxHours !== 1 ? 's' : ''} max session from login
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="number"
              min={1}
              max={24}
              value={form.sessionMaxHours}
              onChange={e => setForm(f => ({
                ...f,
                sessionMaxHours: Math.min(24, Math.max(1, Number(e.target.value) || 1)),
              }))}
              className="w-20 px-3 py-2 text-sm text-center border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 font-semibold"
            />
            <span className="text-sm text-gray-500 w-6">hrs</span>
          </div>
        </div>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <ul className="space-y-1 text-xs leading-relaxed">
          <li><strong>Idle timeout</strong> resets on any click, key press, or touch — only true inactivity triggers it.</li>
          <li><strong>Session limit</strong> is a hard clock from login time that no activity can extend.</li>
          <li>Both limits apply to <strong>all staff</strong> in your business.</li>
        </ul>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        {lastSaved ? (
          <p className="text-xs text-gray-400">
            Last saved: {new Date(lastSaved).toLocaleString()}
          </p>
        ) : <span />}

        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
            : <><CheckCircle className="w-4 h-4" />Save</>
          }
        </button>
      </div>
    </div>
  )
}
