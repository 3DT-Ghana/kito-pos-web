'use client'

import { useEffect, useState } from 'react'
import { Printer, Check, RefreshCw } from 'lucide-react'
import { findPrinters } from '@/lib/print/qzTray'
import { savePrinterName } from '@/lib/print/print'

interface ReceiptSettingsProps {
  initialSettings: {
    showManufacturerOnReceipt: boolean
    receiptPrinterWidth: string
    receiptPrinterName: string | null
    reportPrinterName: string | null
  }
  tenantId: string
}

export function ReceiptSettings({ initialSettings, tenantId }: ReceiptSettingsProps) {
  const [showManufacturer, setShowManufacturer] = useState(initialSettings.showManufacturerOnReceipt)
  const [printerWidth, setPrinterWidth] = useState(initialSettings.receiptPrinterWidth)
  const [receiptPrinter, setReceiptPrinter] = useState(initialSettings.receiptPrinterName ?? '')
  const [reportPrinter, setReportPrinter] = useState(initialSettings.reportPrinterName ?? '')
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([])
  const [detectingPrinters, setDetectingPrinters] = useState(false)
  const [qzStatus, setQzStatus] = useState<'unknown' | 'connected' | 'unavailable'>('unknown')
  const [qzError, setQzError] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // Sync printer names to localStorage for use by smartPrint
  useEffect(() => {
    savePrinterName('receipt', receiptPrinter || null)
    savePrinterName('report', reportPrinter || null)
  }, [receiptPrinter, reportPrinter])

  const detectPrinters = async () => {
    setDetectingPrinters(true)
    setQzStatus('unknown')
    setQzError('')
    try {
      const { printers, error } = await findPrinters()
      if (printers.length > 0) {
        setAvailablePrinters(printers)
        setQzStatus('connected')
      } else {
        setQzStatus('unavailable')
        setQzError(error ?? '')
      }
    } catch (err) {
      setQzStatus('unavailable')
      setQzError(err instanceof Error ? err.message : 'Printer detection failed.')
    } finally {
      setDetectingPrinters(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showManufacturerOnReceipt: showManufacturer,
          receiptPrinterWidth: printerWidth,
          receiptPrinterName: receiptPrinter || null,
          reportPrinterName: reportPrinter || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save settings')
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
        <div className="bg-blue-100 p-3">
          <Printer className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Receipt & Printer Settings</h2>
          <p className="text-sm text-gray-600">Configure printers and receipt layout</p>
        </div>
      </div>

      <div className="space-y-6">

        {/* QZ Tray Printer Setup */}
        <div className="border-2 border-gray-200 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Direct Printer Setup</h3>
              <p className="text-sm text-gray-500 mt-1">
                Configure printers for silent printing (no dialog). Requires{' '}
                <strong>QZ Tray</strong> to be installed and running on this computer.{' '}
                <a href="https://qz.io/download/" target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  Download QZ Tray
                </a>
              </p>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-blue-700 font-semibold">
                  QZ Tray blocked or not working? Print silently without it
                </summary>
                <div className="mt-2 space-y-2 text-gray-600">
                  <p>
                    Chrome and Edge can print with no dialog when started in kiosk-printing
                    mode. Nothing extra is installed, and no extension can block it.
                  </p>
                  <ol className="list-decimal ml-5 space-y-1">
                    <li>Set the receipt printer as the <strong>default printer</strong> in Windows.</li>
                    <li>Make a desktop shortcut to the browser and add the flag below to its Target.</li>
                    <li>Always open the till from that shortcut.</li>
                  </ol>
                  <code className="block bg-gray-100 px-3 py-2 text-xs break-all">
                    chrome.exe --kiosk-printing --app=https://citizen-pos.eyosolutions.com
                  </code>
                  <p className="text-xs">
                    Receipts then print straight to the default printer. Paper size still comes
                    from the printer&apos;s own settings, so set it to your 80mm roll there.
                  </p>
                </div>
              </details>
            </div>
            <button
              type="button"
              onClick={detectPrinters}
              disabled={detectingPrinters}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold shrink-0 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${detectingPrinters ? 'animate-spin' : ''}`} />
              {detectingPrinters ? 'Detecting...' : 'Detect Printers'}
            </button>
          </div>

          {qzStatus === 'unavailable' && (
            <div className="bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1">
              <p className="font-semibold">Printers could not be detected</p>
              {qzError ? (
                <p>{qzError}</p>
              ) : (
                <p>Make sure QZ Tray is installed and running, then click Detect Printers again.</p>
              )}
              <p className="text-xs">
                Without QZ Tray the app falls back to the browser print dialog, which still prints.
              </p>
            </div>
          )}

          {qzStatus === 'connected' && (
            <div className="bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 font-medium">
              QZ Tray connected — {availablePrinters.length} printer{availablePrinters.length !== 1 ? 's' : ''} found.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                POS Receipt Printer <span className="text-gray-400 font-normal">(thermal)</span>
              </label>
              {availablePrinters.length > 0 ? (
                <select
                  value={receiptPrinter}
                  onChange={e => setReceiptPrinter(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
                >
                  <option value="">— Use browser dialog —</option>
                  {availablePrinters.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={receiptPrinter}
                  onChange={e => setReceiptPrinter(e.target.value)}
                  placeholder="e.g. EPSON TM-T20"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
                />
              )}
              <p className="text-xs text-gray-400 mt-1">Used when printing POS receipts</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Invoice / Report Printer <span className="text-gray-400 font-normal">(A4)</span>
              </label>
              {availablePrinters.length > 0 ? (
                <select
                  value={reportPrinter}
                  onChange={e => setReportPrinter(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
                >
                  <option value="">— Use browser dialog —</option>
                  {availablePrinters.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={reportPrinter}
                  onChange={e => setReportPrinter(e.target.value)}
                  placeholder="e.g. HP LaserJet"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
                />
              )}
              <p className="text-xs text-gray-400 mt-1">Used when printing invoices and reports</p>
            </div>
          </div>
        </div>

        {/* Show Manufacturer Toggle */}
        <div className="border-2 border-gray-200 p-5 hover:border-blue-300 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <label htmlFor="showManufacturer" className="text-lg font-bold text-gray-900 cursor-pointer">
                Show Manufacturer on Receipts
              </label>
              <p className="text-sm text-gray-600 mt-2">
                When enabled, item receipts will show:<br />
                <span className="font-mono bg-gray-100 px-2 py-1 mt-1 inline-block">Sugar 1kg (Dangote)</span>
              </p>
              <p className="text-sm text-gray-600 mt-2">
                When disabled, receipts will only show:<br />
                <span className="font-mono bg-gray-100 px-2 py-1 mt-1 inline-block">Sugar 1kg</span>
              </p>
            </div>
            <div className="ml-4">
              <button
                id="showManufacturer"
                type="button"
                onClick={() => setShowManufacturer(!showManufacturer)}
                className={`relative inline-flex h-12 w-24 shrink-0 cursor-pointer border-4 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  showManufacturer ? 'bg-blue-600 border-blue-600' : 'bg-gray-200 border-gray-200'
                }`}
              >
                <span className={`pointer-events-none inline-block h-full w-10 transform bg-white shadow ring-0 transition duration-200 ease-in-out ${showManufacturer ? 'translate-x-10' : 'translate-x-0'}`}>
                  {showManufacturer && <Check className="w-full h-full p-2 text-blue-600" />}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Printer Width */}
        <div className="border-2 border-gray-200 p-5 hover:border-blue-300 transition-colors">
          <label className="text-lg font-bold text-gray-900 block mb-3">Receipt Printer Width</label>
          <p className="text-sm text-gray-600 mb-4">Select your thermal printer&apos;s paper width</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['58mm', '80mm'] as const).map(w => (
              <button
                key={w}
                type="button"
                onClick={() => setPrinterWidth(w)}
                className={`p-4 border-2 transition-all ${printerWidth === w ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-300 hover:border-blue-300'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="font-bold text-lg">{w}{w === '80mm' ? ' (Recommended)' : ''}</div>
                    <div className="text-sm text-gray-600">{w === '58mm' ? 'Compact printer' : 'Standard printer'}</div>
                    <div className="text-xs text-gray-500 mt-1">{w === '58mm' ? 'Most portable printers' : 'Most receipt printers'}</div>
                  </div>
                  {printerWidth === w && (
                    <div className="bg-blue-600 p-1">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
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
