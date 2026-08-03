'use client'

import { useState, useEffect, useRef } from 'react'

interface AmountEntryModalProps {
  open: boolean
  title?: string
  /** Amount already entered, shown pre-selected so typing replaces it. */
  initialValue?: string
  /** Shown under the field, e.g. the balance still owed. */
  hint?: string
  onAccept: (amount: string) => void
  onClose: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

/**
 * Amount entry for the POS.
 *
 * The inline field kept losing partial input to re-renders and refocus, so
 * amounts are captured here instead: one input that owns its own state for the
 * life of the modal, committed on Accept. Nothing outside re-renders while the
 * cashier types, so a digit cannot be dropped or overwritten.
 */
export function AmountEntryModal(props: AmountEntryModalProps) {
  // Mounting the body only while open means its state starts fresh from
  // initialValue every time, with no effect needed to re-seed it.
  if (!props.open) return null
  return <AmountEntryModalBody {...props} />
}

function AmountEntryModalBody({
  title = 'Enter Amount',
  initialValue = '',
  hint,
  onAccept,
  onClose,
}: AmountEntryModalProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 50)
    return () => clearTimeout(t)
  }, [])

  // Digits and a single decimal point, matching what the POS buffers expect.
  const sanitize = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const parts = cleaned.split('.')
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned
  }

  const pressKey = (k: string) => {
    if (k === '⌫') { setValue(v => v.slice(0, -1)); return }
    if (k === '.' && value.includes('.')) return
    setValue(v => sanitize(v + k))
  }

  const parsed = parseFloat(value)
  const valid = !isNaN(parsed) && parsed >= 0 && value.trim() !== ''

  const handleAccept = () => {
    if (!valid) return
    onAccept(value.trim())
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="bg-white w-full max-w-xs shadow-2xl"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <p className="text-sm font-bold text-gray-900">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Display */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-baseline gap-1 border-2 border-indigo-300 focus-within:border-indigo-600 px-3 py-2">
            <span className="text-lg font-black text-gray-400 select-none">GHS</span>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              aria-label={title}
              value={value}
              onChange={e => setValue(sanitize(e.target.value))}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleAccept() }
                else if (e.key === 'Escape') { e.preventDefault(); onClose() }
              }}
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent text-right text-2xl font-black tracking-tight focus:outline-none placeholder:text-gray-300"
            />
          </div>
          <p className="text-xs text-gray-400 text-center mt-1">
            {hint ?? 'Press Enter to accept · Esc to cancel'}
          </p>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-px bg-gray-200 mx-4 mb-4">
          {KEYS.map(k => (
            <button
              key={k}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pressKey(k)}
              className={`py-4 text-lg font-bold bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors ${
                k === '⌫' ? 'text-red-500' : 'text-gray-900'
              }`}
            >
              {k}
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
