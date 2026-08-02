'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'

/**
 * Import Customers Page
 *
 * Upload a CSV to bulk-create customers with optional opening balances.
 *
 * CSV columns (header row required):
 *   name, phone (optional), balance (optional)
 */

const REQUIRED_COLS = ['name']
const TEMPLATE_CSV = `name,phone,balance
Kwame Mensah,0244123456,150.00
Ama Owusu,0201987654,0
Kofi Asante,,75.50`

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim())
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
  return { headers, rows }
}

export default function ImportCustomersPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [csvText, setCsvText] = useState('')
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null)
  const [parseError, setParseError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      setCsvText(text)
      handleParse(text)
    }
    reader.readAsText(file)
  }

  const handleParse = (text = csvText) => {
    setParseError('')
    setResult(null)
    const p = parseCSV(text)
    if (!p.headers.length) { setParseError('No valid data found. Make sure the CSV has a header row.'); return }
    const missing = REQUIRED_COLS.filter(c => !p.headers.includes(c))
    if (missing.length) { setParseError(`Missing required columns: ${missing.join(', ')}`); return }
    if (p.rows.length === 0) { setParseError('No data rows found.'); return }
    setParsed(p)
  }

  const handleSubmit = async () => {
    if (!parsed) return
    setIsSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/import/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsed.rows }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setResult(data)
      setParsed(null)
      setCsvText('')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/customers')} className="p-2 hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Import Customers</h1>
            <p className="text-sm text-gray-500">Upload a CSV to bulk-create customers with opening balances</p>
          </div>
        </div>

        {/* Result banner */}
        {result && (
          <div className={`p-4 border ${result.skipped === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <p className="font-semibold text-gray-900">
              Import complete — {result.imported} imported, {result.skipped} skipped
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-sm text-red-700 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* CSV format info */}
        <div className="bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">CSV columns:</p>
          <p className="font-mono text-xs bg-blue-100  px-2 py-1 inline-block">
            name, phone, balance
          </p>
          <p className="mt-1 text-xs text-blue-600">
            • <strong>name</strong> is required · <strong>phone</strong> and <strong>balance</strong> are optional
          </p>
          <button
            onClick={() => {
              const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = 'customers_template.csv'
              a.click()
            }}
            className="mt-2 text-xs text-blue-700 underline"
          >
            Download template CSV
          </button>
        </div>

        {/* Upload area */}
        <div className="bg-white border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Upload CSV file</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <p className="text-3xl mb-2">📂</p>
              <p className="text-sm font-semibold text-gray-600">Click to choose a CSV file</p>
              <p className="text-xs text-gray-400 mt-1">or paste CSV text below</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Or paste CSV text</label>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={TEMPLATE_CSV}
              rows={6}
              className="w-full px-4 py-3 border-2 border-gray-200 text-sm font-mono focus:border-blue-500 focus:outline-none resize-y"
            />
          </div>

          {parseError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
              {parseError}
            </div>
          )}

          <button
            onClick={() => handleParse()}
            disabled={!csvText.trim()}
            className="px-5 py-2.5 border-2 border-blue-500 text-blue-600 font-semibold text-sm hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Preview
          </button>
        </div>

        {/* Preview table */}
        {parsed && (
          <div className="bg-white border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">
                Preview — {parsed.rows.length} row{parsed.rows.length !== 1 ? 's' : ''}
              </h2>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className={`px-5 py-2 font-semibold text-sm text-white ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {isSubmitting ? 'Importing…' : `Import ${parsed.rows.length} customers`}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2 text-xs font-bold text-gray-500 uppercase">#</th>
                    <th className="text-left px-4 py-2 text-xs font-bold text-gray-500 uppercase">Name</th>
                    <th className="text-left px-4 py-2 text-xs font-bold text-gray-500 uppercase">Phone</th>
                    <th className="text-right px-4 py-2 text-xs font-bold text-gray-500 uppercase">Opening Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsed.rows.slice(0, 50).map((row, i) => {
                    const bal = parseFloat(row.balance || '0')
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-400 text-xs">{i + 2}</td>
                        <td className="px-4 py-2 font-semibold text-gray-900">{row.name || <span className="text-red-500">missing</span>}</td>
                        <td className="px-4 py-2 text-gray-500">{row.phone || '—'}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${bal > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {bal > 0 ? formatCurrency(bal) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {parsed.rows.length > 50 && (
                <p className="text-xs text-gray-400 px-4 py-3 border-t border-gray-100">
                  Showing first 50 of {parsed.rows.length} rows. All rows will be imported.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
