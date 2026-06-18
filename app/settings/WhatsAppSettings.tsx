'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'

interface WhatsAppSettingsProps {
  tenantId: string
  initialSettings: {
    enableWhatsApp: boolean
    metaWabaToken: string | null
    metaWabaPhoneNumberId: string | null
  }
}

export function WhatsAppSettings({ tenantId, initialSettings }: WhatsAppSettingsProps) {
  const [enabled,         setEnabled]         = useState(initialSettings.enableWhatsApp)
  const [token,           setToken]           = useState(initialSettings.metaWabaToken ?? '')
  const [phoneNumberId,   setPhoneNumberId]   = useState(initialSettings.metaWabaPhoneNumberId ?? '')
  const [testPhone,       setTestPhone]       = useState('')
  const [isSaving,        setIsSaving]        = useState(false)
  const [isTesting,       setIsTesting]       = useState(false)
  const [showToken,       setShowToken]       = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [testMsg, setTestMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSave() {
    setIsSaving(true); setSaveMsg(null)
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableWhatsApp: enabled,
          metaWabaToken: token.trim() || null,
          metaWabaPhoneNumberId: phoneNumberId.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      setSaveMsg({ type: 'success', text: 'WhatsApp settings saved.' })
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleTest() {
    if (!testPhone.trim()) return
    setIsTesting(true); setTestMsg(null)
    try {
      const res = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testPhone.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setTestMsg({ type: 'success', text: `Test message sent! ID: ${data.messageId ?? 'N/A'}` })
    } catch (err) {
      setTestMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send test message' })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="bg-white shadow-sm border-2 border-gray-200 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
            <MessageCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">WhatsApp Notifications</h2>
            <p className="text-sm text-gray-500 mt-1">
              Send rich WhatsApp messages to customers — payment receipts, sale confirmations, balance reminders, and delivery dispatches.
              Uses Meta WhatsApp Business Cloud API (free per-message).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEnabled(v => !v)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer border-2 border-transparent transition-colors ${enabled ? 'bg-emerald-600' : 'bg-gray-300'}`}
          role="switch"
          aria-checked={enabled}
        >
          <span className={`inline-block h-6 w-6 transform bg-white shadow-md transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Setup guide */}
      <div className="bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 space-y-1">
        <p className="font-bold">How to set up (one-time):</p>
        <ol className="list-decimal list-inside space-y-1 text-emerald-800">
          <li>Go to <span className="font-mono bg-white px-1">developers.facebook.com</span> → Create an App → Add WhatsApp product</li>
          <li>In <strong>WhatsApp → API Setup</strong>, copy your <strong>Phone Number ID</strong></li>
          <li>In <strong>Business Settings → System Users</strong>, create a System User and generate a permanent token with <code>whatsapp_business_messaging</code> permission</li>
          <li>Paste both values below and save</li>
        </ol>
      </div>

      {/* Credentials */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Phone Number ID
          </label>
          <input
            type="text"
            value={phoneNumberId}
            onChange={e => setPhoneNumberId(e.target.value)}
            placeholder="e.g. 123456789012345"
            className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-emerald-500 focus:outline-none text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">Found in Meta App → WhatsApp → API Setup → Phone Number ID</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            System User Access Token (permanent)
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-emerald-500 focus:outline-none text-sm font-mono pr-16"
            />
            <button type="button" onClick={() => setShowToken(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 font-semibold">
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Use a permanent System User token — not the temporary test token (which expires in 24h)</p>
        </div>
      </div>

      {saveMsg && (
        <div className={`px-4 py-3 text-sm font-medium ${saveMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {saveMsg.text}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="px-6 py-2.5 bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 text-sm"
      >
        {isSaving ? 'Saving…' : 'Save WhatsApp Settings'}
      </button>

      {/* Test message */}
      {token && phoneNumberId && (
        <div className="border-t pt-5 space-y-3">
          <h3 className="text-base font-bold text-gray-800">Send Test Message</h3>
          <p className="text-sm text-gray-500">Verify your credentials by sending a test WhatsApp to a phone number (must have WhatsApp).</p>
          <div className="flex gap-2">
            <input
              type="tel"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder="e.g. 0244123456"
              className="flex-1 px-4 py-2.5 border-2 border-gray-200 focus:border-emerald-500 focus:outline-none text-sm"
            />
            <button
              onClick={handleTest}
              disabled={isTesting || !testPhone.trim()}
              className="px-4 py-2.5 bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 text-sm whitespace-nowrap"
            >
              {isTesting ? 'Sending…' : 'Send Test'}
            </button>
          </div>
          {testMsg && (
            <div className={`px-4 py-3 text-sm font-medium ${testMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {testMsg.text}
            </div>
          )}
        </div>
      )}

      {/* What gets sent */}
      <div className="border-t pt-5">
        <h3 className="text-sm font-bold text-gray-700 mb-2">Automatic WhatsApp triggers</h3>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li className="flex items-start gap-2"><MessageCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> Sale recorded — confirmation sent to customer (if phone on file)</li>
          <li className="flex items-start gap-2"><MessageCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> Customer payment received — receipt with new balance sent</li>
          <li className="flex items-start gap-2"><MessageCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> Waybill dispatched — delivery notification sent to consignee</li>
          <li className="flex items-start gap-2"><MessageCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> Manual balance reminder — send from Customers list (green chat icon)</li>
        </ul>
      </div>
    </div>
  )
}
