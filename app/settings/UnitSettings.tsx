'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'

interface UnitSettingsProps {
  initialUseUnitSystem: boolean
  tenantId: string
}

export function UnitSettings({ initialUseUnitSystem, tenantId }: UnitSettingsProps) {
  const [useUnitSystem, setUseUnitSystem] = useState(initialUseUnitSystem)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useUnitSystem }),
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

  return (
    <div className="bg-white shadow-sm border-2 border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-amber-100 p-3">
          <span className="text-2xl">📦</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Unit System</h2>
          <p className="text-sm text-gray-600">Control how item quantities are tracked and sold</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Toggle */}
        <div className="border-2 border-gray-200 p-5 hover:border-amber-300 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <label htmlFor="useUnitSystem" className="text-lg font-bold text-gray-900 cursor-pointer">
                Enable Unit System
              </label>
              <p className="text-sm text-gray-600 mt-1">
                When <strong>enabled</strong>, each item has a unit (e.g. <em>carton</em>) and a number of pieces per unit (e.g. 12).
                Stock is tracked in units and can be fractional — selling half a carton records <strong>0.5</strong>.
              </p>
              <p className="text-sm text-gray-600 mt-1">
                When <strong>disabled</strong>, items track whole numbers only (normal mode).
              </p>
            </div>
            <div className="shrink-0 mt-1">
              <button
                id="useUnitSystem"
                type="button"
                onClick={() => setUseUnitSystem(!useUnitSystem)}
                className={`relative inline-flex h-12 w-24 shrink-0 cursor-pointer rounded-full border-4 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                  useUnitSystem ? 'bg-amber-500 border-amber-500' : 'bg-gray-200 border-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-full w-10 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    useUnitSystem ? 'translate-x-10' : 'translate-x-0'
                  }`}
                >
                  {useUnitSystem && <Check className="w-full h-full p-2 text-amber-500" />}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className={`p-4 space-y-3 text-sm transition-all ${useUnitSystem ? 'bg-amber-50 border-2 border-amber-200' : 'bg-gray-50 border-2 border-gray-200 opacity-60'}`}>
          <p className="font-bold text-gray-900">How it works when enabled:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: '1️⃣', title: 'Set up items', desc: 'Each item gets a unit name (e.g. "carton") and pieces-per-unit (e.g. 12 pieces per carton).' },
              { icon: '2️⃣', title: 'Sell in fractions', desc: 'When making a sale, enter cartons + extra pieces. The system converts to the total unit count.' },
              { icon: '3️⃣', title: 'Fractional stock', desc: 'Selling 1 carton + 6 pieces from 2 cartons leaves 0.5 cartons remaining in stock.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="bg-white p-3 shadow-sm">
                <div className="text-xl mb-1">{icon}</div>
                <p className="font-semibold text-gray-900 text-xs">{title}</p>
                <p className="text-gray-600 text-xs mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-700 font-medium">
            ⚠ Changing this setting does not affect existing stock levels. Set unit fields on each item after enabling.
          </p>
        </div>

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
              className="px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
