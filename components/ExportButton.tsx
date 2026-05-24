'use client'

import { useState } from 'react'
import { exportExcel, exportCSV } from '@/lib/utils/export'

interface ExportButtonProps {
  getData: () => Record<string, unknown>[] | Promise<Record<string, unknown>[]>
  filename: string
  label?: string
}

/**
 * ExportButton — reusable dropdown export to Excel or CSV.
 *
 * Usage:
 *   <ExportButton
 *     filename="sales-2026-02"
 *     getData={() => sales.map(s => ({ Date: s.createdAt, Total: s.totalAmount }))}
 *   />
 */
export function ExportButton({ getData, filename, label = 'Export' }: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handle = async (type: 'excel' | 'csv') => {
    setOpen(false)
    setLoading(true)
    try {
      const rows = await getData()
      if (!rows.length) { alert('No data to export'); return }
      if (type === 'excel') await exportExcel(rows, filename)
      else exportCSV(rows, filename)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        {label}
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-100 shadow-xl z-20 overflow-hidden">
            <button
              onClick={() => handle('excel')}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <span>📊</span> Excel (.xlsx)
            </button>
            <button
              onClick={() => handle('csv')}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <span>📄</span> CSV (.csv)
            </button>
          </div>
        </>
      )}
    </div>
  )
}
