'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'

interface PricingSettingsProps {
  initialSettings: {
    enableRetailPrice: boolean
    enableWholesalePrice: boolean
    enablePromoPrice: boolean
    enableDiscounts: boolean
  }
  tenantId: string
}

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-3 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        checked ? 'bg-blue-600 border-blue-600' : 'bg-gray-200 border-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-full w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-8' : 'translate-x-0'
        }`}
      >
        {checked && <Check className="w-full h-full p-1 text-blue-600" />}
      </span>
    </button>
  )
}

export function PricingSettings({ initialSettings, tenantId }: PricingSettingsProps) {
  const [settings, setSettings] = useState(initialSettings)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const toggle = (key: keyof typeof settings) =>
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed')
      setMessage('Settings saved successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch {
      setMessage('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const tiers = [
    {
      key: 'enableRetailPrice' as const,
      label: 'Retail Price',
      icon: '🛒',
      desc: 'Add a retail price tier to each item. Cashier can switch to retail pricing at sale time.',
    },
    {
      key: 'enableWholesalePrice' as const,
      label: 'Wholesale Price',
      icon: '📦',
      desc: 'Add a wholesale price tier for bulk buyers. Useful for B2B or distributor customers.',
    },
    {
      key: 'enablePromoPrice' as const,
      label: 'Promotional Price',
      icon: '🏷️',
      desc: 'Add a promo/special price tier for limited-time offers or clearance items.',
    },
  ]

  return (
    <div className="bg-white shadow-sm border-2 border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-blue-100 p-3">
          <span className="text-2xl">💰</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pricing & Discounts</h2>
          <p className="text-sm text-gray-600">Control price tiers and discount options at point of sale</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Price Tiers */}
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Price Tiers</p>
        {tiers.map(({ key, label, icon, desc }) => (
          <div
            key={key}
            className="border-2 border-gray-200 p-4 hover:border-blue-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <span className="text-2xl mt-0.5">{icon}</span>
                <div>
                  <label htmlFor={key} className="text-base font-bold text-gray-900 cursor-pointer">
                    {label}
                  </label>
                  <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
                </div>
              </div>
              <div className="shrink-0 mt-1">
                <Toggle id={key} checked={settings[key]} onChange={() => toggle(key)} />
              </div>
            </div>
          </div>
        ))}

        {/* Discounts */}
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-2">Discounts</p>
        <div className="border-2 border-gray-200 p-4 hover:border-blue-200 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <span className="text-2xl mt-0.5">✂️</span>
              <div>
                <label htmlFor="enableDiscounts" className="text-base font-bold text-gray-900 cursor-pointer">
                  Sale Discounts
                </label>
                <p className="text-sm text-gray-500 mt-0.5">
                  Allow cashiers to apply a discount per sale — either a fixed amount (GH₵) or a percentage (%).
                </p>
              </div>
            </div>
            <div className="shrink-0 mt-1">
              <Toggle id="enableDiscounts" checked={settings.enableDiscounts} onChange={() => toggle('enableDiscounts')} />
            </div>
          </div>
        </div>

        {/* Info box when any tier is enabled */}
        {(settings.enableRetailPrice || settings.enableWholesalePrice || settings.enablePromoPrice) && (
          <div className="bg-blue-50 border-2 border-blue-200 p-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">📋 How price tiers work:</p>
            <ul className="space-y-1 text-xs list-disc list-inside text-blue-700">
              <li>Go to each item and set the additional price(s) once enabled.</li>
              <li>At the point of sale, the cashier can pick which price tier applies to each item in the cart.</li>
              <li>Default price (selling price) is always available.</li>
            </ul>
          </div>
        )}

        {/* Save */}
        <div className="flex items-center justify-between pt-4 border-t-2 border-gray-200">
          {message && (
            <div className={`text-sm font-semibold ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
              {message}
            </div>
          )}
          <div className={!message ? 'ml-auto' : ''}>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
