'use client'

import { useState, useEffect, useRef } from 'react'

interface MomoPhoneModalProps {
  open: boolean
  initialValue?: string
  onAccept: (phone: string) => void
  onClose: () => void
}

const DIGITS = ['1','2','3','4','5','6','7','8','9','*','0','⌫']

export function MomoPhoneModal({ open, initialValue = '', onAccept, onClose }: MomoPhoneModalProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  if (!open) return null

  const pressDigit = (d: string) => {
    if (d === '⌫') { setValue(v => v.slice(0, -1)); return }
    if (d === '*') return
    if (value.length >= 12) return
    setValue(v => v + d)
  }

  const handleAccept = () => {
    const phone = value.trim()
    if (phone.length < 9) return
    onAccept(phone)
    onClose()
  }

  const valid = value.trim().length >= 9

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-xs shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <p className="text-sm font-bold text-gray-900">Enter MoMo Number</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        {/* Display */}
        <div className="px-4 pt-4 pb-2">
          <input
            ref={inputRef}
            type="text"
            // "numeric", not "none": the on-screen pad is for touch terminals,
            // but a keyboard user must be able to click in and simply type.
            inputMode="numeric"
            autoComplete="tel"
            value={value}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 12)
              setValue(v)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleAccept() }
              else if (e.key === 'Escape') { e.preventDefault(); onClose() }
            }}
            placeholder="0244 123 456"
            className="w-full px-4 py-3 border-2 border-indigo-300 focus:border-indigo-600 focus:outline-none text-xl font-bold tracking-widest text-center"
          />
          <p className="text-xs text-gray-400 text-center mt-1">
            {value.length >= 9 ? `✓ ${value.length} digits` : `Enter at least 9 digits`}
          </p>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-px bg-gray-200 mx-4 mb-4">
          {DIGITS.map(d => (
            <button
              key={d}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pressDigit(d)}
              className={`py-4 text-lg font-bold bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors ${
                d === '⌫' ? 'text-red-500' : d === '*' ? 'invisible' : 'text-gray-900'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={!valid}
            className="flex-1 py-3 bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
