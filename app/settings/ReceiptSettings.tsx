'use client'

import { useEffect, useState } from 'react'
import { Printer, Check } from 'lucide-react'
import { smartPrint, saveReceiptWidth, getReceiptBehaviour, saveReceiptBehaviour, type ReceiptBehaviour } from '@/lib/print/print'
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
  const [testingPrint, setTestingPrint] = useState(false)
  const [kioskHint, setKioskHint] = useState('')
  const [receiptBehaviour, setReceiptBehaviour] = useState<ReceiptBehaviour>('preview')

  useEffect(() => { setReceiptBehaviour(getReceiptBehaviour()) }, [])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // Sync printer names to localStorage for use by smartPrint
  useEffect(() => {
    savePrinterName('receipt', receiptPrinter || null)
    savePrinterName('report', reportPrinter || null)
  }, [receiptPrinter, reportPrinter])

  // Mirror the paper width to localStorage so the print CSS can size the page
  // without waiting for a server round trip.
  useEffect(() => {
    saveReceiptWidth(printerWidth)
  }, [printerWidth])

  // Prints a sample sale through the same path a real receipt uses, so the
  // paper geometry, the layout and the silent-versus-dialog behaviour are all
  // exercised rather than just proving a printer exists.
  const runPrintTest = () => {
    setTestingPrint(true)
    const now = new Date()
    const money = (n: number) => n.toFixed(2)
    const lines = [
      { name: 'SPARK 50 128 ROM/4 RAM', qty: 1, price: 1890 },
      { name: 'NOKIA 106', qty: 2, price: 130 },
      { name: 'it2165', qty: 3, price: 90 },
    ]
    const subtotal = lines.reduce((t, l) => t + l.qty * l.price, 0)
    const tendered = Math.ceil(subtotal / 50) * 50

    const holder = document.createElement('div')
    holder.className = 'thermal-receipt'
    holder.style.cssText = `width:${printerWidth};max-width:${printerWidth};font-family:'Courier New',monospace;font-size:${printerWidth === '58mm' ? '10px' : '12px'};line-height:1.4;padding:8px;background:#fff;color:#000;position:fixed;left:-10000px;top:0;`
    holder.innerHTML = `
      <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:6px">
        <div style="font-weight:700;font-size:${printerWidth === '58mm' ? '13px' : '15px'}">SAMPLE RECEIPT</div>
        <div style="font-size:10px">Printer test — not a real sale</div>
      </div>
      <div style="margin-bottom:6px">
        <div>${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
        <div>Receipt #: TEST-0001</div>
        <div>Served by: Test</div>
      </div>
      <div style="border-top:1px dashed #000;padding-top:4px">
        ${lines.map(l => `
          <div style="display:flex;justify-content:space-between;gap:6px;margin-bottom:3px">
            <span style="flex:1">${l.name}</span>
            <span style="white-space:nowrap">${l.qty} x ${money(l.price)}</span>
            <span style="white-space:nowrap;font-weight:600">${money(l.qty * l.price)}</span>
          </div>`).join('')}
      </div>
      <div style="border-top:1px dashed #000;margin-top:6px;padding-top:6px">
        <div style="display:flex;justify-content:space-between"><span>SUBTOTAL</span><span>${money(subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:${printerWidth === '58mm' ? '12px' : '14px'};border-top:1px solid #000;margin-top:4px;padding-top:4px">
          <span>TOTAL</span><span>${money(subtotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px"><span>CASH</span><span>${money(tendered)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>CHANGE</span><span>${money(tendered - subtotal)}</span></div>
      </div>
      <div style="text-align:center;border-top:2px solid #000;margin-top:8px;padding-top:6px">
        <div style="font-weight:700">THANK YOU!</div>
        <!-- A physical ruler for the paper. If the bar below is not exactly
             70mm on the printout, the driver is scaling the page and no CSS
             change will fix it — the fix is Scale=100% in printer settings. -->
        <div style="margin:6px 0 2px">
          <div style="width:70mm;height:2mm;background:#000;margin:0 auto"></div>
          <div style="font-size:8px;margin-top:1mm">&#9650; this bar should measure exactly 70mm &#9650;</div>
        </div>
        <div style="font-size:9px;margin-top:2px">Paper width: ${printerWidth}</div>
      </div>
      <div class="receipt-feed" aria-hidden="true"></div>`
    document.body.appendChild(holder)

    // A dialog means --kiosk-printing is not active on this browser. window
    // .print() blocks while the dialog is open, so a near-instant return
    // indicates silent printing; anything slower means the operator saw a
    // dialog and we say so rather than leaving them to guess.
    const startedAt = Date.now()
    try {
      void smartPrint('receipt', holder)
    } finally {
      const elapsed = Date.now() - startedAt
      setKioskHint(elapsed > 400
        ? 'A print dialog appeared, so this browser is not running with --kiosk-printing. Open the till from the kiosk shortcut (see the note above) for silent printing. In the dialog, also untick "Headers and footers" to remove the URL, date and page title from the paper.'
        : '')
      // Leave it mounted briefly so the print engine can rasterise it.
      setTimeout(() => { holder.remove(); setTestingPrint(false) }, 1500)
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

        {/* Printer names — window.print() cannot choose a printer, so these are
            stored for the print agent and to record the operator's intent. */}
        <div className="border-2 border-gray-200 p-5">
          <h3 className="text-lg font-bold text-gray-900">Printers</h3>
          <p className="text-sm text-gray-600 mt-1 mb-4">
            Receipts print through the browser, which uses the computer&apos;s{' '}
            <strong>default printer</strong>. Set the receipt printer as the default in
            Windows, and start the till from a shortcut with{' '}
            <code className="bg-gray-100 px-1 text-xs">--kiosk-printing</code> to print
            without a dialog.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Receipt printer
              </label>
              <input
                type="text"
                value={receiptPrinter}
                onChange={e => setReceiptPrinter(e.target.value)}
                placeholder="e.g. XP-80C"
                className="w-full px-3 py-2 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Report printer
              </label>
              <input
                type="text"
                value={reportPrinter}
                onChange={e => setReportPrinter(e.target.value)}
                placeholder="e.g. HP LaserJet"
                className="w-full px-3 py-2 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runPrintTest}
              disabled={testingPrint}
              title="Print a sample receipt using the current settings"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              🖨 {testingPrint ? 'Sending...' : 'Test Print'}
            </button>
          </div>

          {kioskHint && (
            <div className="mt-3 bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-900 space-y-1">
              <p className="font-semibold">Printing is not silent on this browser</p>
              <p>{kioskHint}</p>
            </div>
          )}
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

        {/* What happens to the receipt after a POS sale */}
        <div className="border-2 border-gray-200 p-5 hover:border-blue-300 transition-colors">
          <label className="text-lg font-bold text-gray-900 block mb-3">After a POS Sale</label>
          <p className="text-sm text-gray-600 mb-4">
            What to do with the receipt once payment completes. This is set per till, not per business.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([
              { v: 'print'   as const, title: 'Print directly',  desc: 'Prints straight away and returns to the next sale. Fastest at a busy counter.' },
              { v: 'preview' as const, title: 'Show preview',    desc: 'Shows the receipt on screen; the cashier chooses to print.' },
              { v: 'none'    as const, title: 'No receipt',      desc: 'Neither. For tills that do not hand out printed receipts.' },
            ]).map(opt => (
              <button
                key={opt.v}
                type="button"
                onClick={() => { setReceiptBehaviour(opt.v); saveReceiptBehaviour(opt.v) }}
                className={`p-4 border-2 text-left transition-all ${receiptBehaviour === opt.v ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-300 hover:border-blue-300'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold">{opt.title}</div>
                    <div className="text-xs text-gray-600 mt-1">{opt.desc}</div>
                  </div>
                  {receiptBehaviour === opt.v && (
                    <div className="bg-blue-600 p-1 shrink-0">
                      <Check className="w-4 h-4 text-white" />
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
