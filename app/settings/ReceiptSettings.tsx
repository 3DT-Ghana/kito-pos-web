'use client'

import { useState } from 'react'
import { Printer, Check } from 'lucide-react'

interface ReceiptSettingsProps {
  initialSettings: {
    showManufacturerOnReceipt: boolean
    receiptPrinterWidth: string
  }
  tenantId: string
}

export function ReceiptSettings({ initialSettings, tenantId }: ReceiptSettingsProps) {
  const [showManufacturer, setShowManufacturer] = useState(initialSettings.showManufacturerOnReceipt)
  const [printerWidth, setPrinterWidth] = useState(initialSettings.receiptPrinterWidth)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setMessage('')

    try {
      const response = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          showManufacturerOnReceipt: showManufacturer,
          receiptPrinterWidth: printerWidth,
        }),
      })

      if (!response.ok) throw new Error('Failed to save settings')

      setMessage('Settings saved successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white shadow-sm border-2 border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-blue-100 p-3">
          <Printer className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Receipt Settings</h2>
          <p className="text-sm text-gray-600">Configure how receipts are printed</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Show Manufacturer Toggle */}
        <div className="border-2 border-gray-200 p-5 hover:border-blue-300 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <label htmlFor="showManufacturer" className="text-lg font-bold text-gray-900 cursor-pointer">
                Show Manufacturer on Receipts
              </label>
              <p className="text-sm text-gray-600 mt-2">
                When enabled, item receipts will show:<br />
                <span className="font-mono bg-gray-100 px-2 py-1  mt-1 inline-block">
                  Sugar 1kg (Dangote)
                </span>
              </p>
              <p className="text-sm text-gray-600 mt-2">
                When disabled, receipts will only show:<br />
                <span className="font-mono bg-gray-100 px-2 py-1  mt-1 inline-block">
                  Sugar 1kg
                </span>
              </p>
            </div>
            <div className="ml-4">
              <button
                id="showManufacturer"
                type="button"
                onClick={() => setShowManufacturer(!showManufacturer)}
                className={`relative inline-flex h-12 w-24 flex-shrink-0 cursor-pointer -full border-4 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  showManufacturer ? 'bg-blue-600 border-blue-600' : 'bg-gray-200 border-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-full w-10 transform -full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showManufacturer ? 'translate-x-10' : 'translate-x-0'
                  }`}
                >
                  {showManufacturer && (
                    <Check className="w-full h-full p-2 text-blue-600" />
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Printer Width Selection */}
        <div className="border-2 border-gray-200 p-5 hover:border-blue-300 transition-colors">
          <label className="text-lg font-bold text-gray-900 block mb-3">
            Receipt Printer Width
          </label>
          <p className="text-sm text-gray-600 mb-4">
            Select your thermal printer&apos;s paper width
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setPrinterWidth('58mm')}
              className={`p-4 border-2 transition-all ${
                printerWidth === '58mm'
                  ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-300 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="font-bold text-lg">58mm</div>
                  <div className="text-sm text-gray-600">Compact printer</div>
                  <div className="text-xs text-gray-500 mt-1">Most portable printers</div>
                </div>
                {printerWidth === '58mm' && (
                  <div className="bg-blue-600 -full p-1">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPrinterWidth('80mm')}
              className={`p-4 border-2 transition-all ${
                printerWidth === '80mm'
                  ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-300 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="font-bold text-lg">80mm (Recommended)</div>
                  <div className="text-sm text-gray-600">Standard printer</div>
                  <div className="text-xs text-gray-500 mt-1">Most receipt printers</div>
                </div>
                {printerWidth === '80mm' && (
                  <div className="bg-blue-600 -full p-1">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Save Button */}
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
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
