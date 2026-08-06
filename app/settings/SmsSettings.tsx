'use client'

import { useState } from 'react'

const MASKED = '••••••••'

interface SmsSettingsProps {
  tenantId: string
  initialSettings: {
    enableSmsNotifications: boolean
    hubtelClientIdSet: boolean
    hubtelClientSecretSet: boolean
    hubtelSenderId: string | null
    hubtelCollectionAccount: string | null
    hubtelCallbackUrl: string | null
  }
}

export function SmsSettings({ tenantId, initialSettings }: SmsSettingsProps) {
  const [enabled, setEnabled] = useState(initialSettings.enableSmsNotifications)
  const [clientId, setClientId] = useState(initialSettings.hubtelClientIdSet ? MASKED : '')
  const [clientSecret, setClientSecret] = useState(initialSettings.hubtelClientSecretSet ? MASKED : '')
  const [senderId, setSenderId] = useState(initialSettings.hubtelSenderId || '')
  const [collectionAccount, setCollectionAccount] = useState(
    initialSettings.hubtelCollectionAccount || ''
  )
  const [callbackUrl, setCallbackUrl] = useState(initialSettings.hubtelCallbackUrl || '')
  const [testPhone, setTestPhone] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [testMsg, setTestMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showSecret, setShowSecret] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableSmsNotifications: enabled,
          ...(clientId !== MASKED ? { hubtelClientId: clientId || null } : {}),
          ...(clientSecret !== MASKED ? { hubtelClientSecret: clientSecret || null } : {}),
          hubtelSenderId: senderId || null,
          hubtelCollectionAccount: collectionAccount.trim() || null,
          hubtelCallbackUrl: callbackUrl.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      setSaveMsg({ type: 'success', text: 'SMS settings saved successfully.' })
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testPhone) return
    setIsTesting(true)
    setTestMsg(null)
    try {
      const res = await fetch('/api/sms/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testPhone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send test SMS')
      setTestMsg({ type: 'success', text: `Test SMS sent successfully! Message ID: ${data.messageId || 'N/A'}` })
    } catch (err) {
      setTestMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send test SMS' })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="bg-white shadow-sm border-2 border-gray-200 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">SMS Notifications</h2>
          <p className="text-sm text-gray-500 mt-1">Send SMS to customers via Hubtel Ghana SMS Gateway — payment confirmations, balance reminders.</p>
        </div>
        {/* Enable toggle */}
        <button
          type="button"
          onClick={() => setEnabled(v => !v)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer -full border-2 border-transparent transition-colors ${enabled ? 'bg-green-600' : 'bg-gray-300'}`}
          role="switch"
          aria-checked={enabled}
        >
          <span className={`inline-block h-6 w-6 transform -full bg-white shadow-md transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Hubtel credentials */}
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
          <strong>How to get credentials:</strong> Log in to{' '}
          <span className="font-mono">app.hubtel.com</span> → Developer → API Keys.
          Your Client ID and Client Secret are listed there. Sender ID must be registered with Hubtel (max 11 chars).
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Hubtel Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="e.g. HBT-XXXXXXXX"
              className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-green-500 focus:outline-none text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Hubtel Client Secret</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="Your Hubtel secret"
                className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-green-500 focus:outline-none text-sm font-mono pr-12"
              />
              <button type="button" onClick={() => setShowSecret(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 font-semibold">
                {showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Sender ID <span className="text-gray-400 font-normal">(max 11 chars)</span>
          </label>
          <input
            type="text"
            value={senderId}
            onChange={e => setSenderId(e.target.value.slice(0, 11))}
            placeholder="e.g. MYBIZ"
            maxLength={11}
            className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-green-500 focus:outline-none text-sm font-mono uppercase"
          />
          <p className="text-xs text-gray-400 mt-1">This name appears as the sender on the customer&apos;s phone. Must be registered with Hubtel.</p>
        </div>

        <div className="max-w-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Collection Account Number{' '}
            <span className="text-gray-400 font-normal">(for number verification)</span>
          </label>
          <input
            type="text"
            value={collectionAccount}
            onChange={e => setCollectionAccount(e.target.value.replace(/\D/g, '').slice(0, 12))}
            placeholder="e.g. 11684"
            inputMode="numeric"
            className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-green-500 focus:outline-none text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            Needed to check a MoMo number is registered before sending a payment prompt.
            Find it in your Hubtel dashboard. Hubtel must also whitelist this
            server&apos;s IP address before verification will work.
          </p>
        </div>

        <div className="max-w-lg">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Payment Callback URL{' '}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="url"
            value={callbackUrl}
            onChange={e => setCallbackUrl(e.target.value.trim())}
            placeholder="https://your-domain.com/api/momo/callback"
            className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-green-500 focus:outline-none text-sm font-mono"
          />
          {callbackUrl && !/^https:\/\//i.test(callbackUrl) && (
            <p className="text-xs text-amber-700 mt-1">
              Hubtel requires https. A plain http address will be rejected.
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Where Hubtel reports the outcome of a payment. Leave blank to rely on the
            till polling for status, which is how it works today &mdash; note that a
            till which loses power or closes the tab mid-payment will not record a sale
            that the customer did approve.
          </p>
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
        className="px-6 py-2.5 bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50 text-sm"
      >
        {isSaving ? 'Saving...' : 'Save SMS Settings'}
      </button>

      {/* Test SMS */}
      {(clientId === MASKED || clientId) && (clientSecret === MASKED || clientSecret) && senderId && (
        <div className="border-t pt-5 space-y-3">
          <h3 className="text-base font-bold text-gray-800">Send Test SMS</h3>
          <p className="text-sm text-gray-500">Verify your credentials work by sending a test message to a phone number.</p>
          <div className="flex gap-2">
            <input
              type="tel"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder="e.g. 0244123456"
              className="flex-1 px-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
            />
            <button
              onClick={handleTest}
              disabled={isTesting || !testPhone}
              className="px-4 py-2.5 bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 text-sm whitespace-nowrap"
            >
              {isTesting ? 'Sending...' : 'Send Test'}
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
        <h3 className="text-sm font-bold text-gray-700 mb-2">Automatic SMS triggers</h3>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> Sale recorded — payment confirmation sent to customer (if phone on file)</li>
          <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> Customer payment received — receipt + remaining balance sent</li>
          <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> Manual balance reminder — send from customer profile page</li>
        </ul>
      </div>
    </div>
  )
}
