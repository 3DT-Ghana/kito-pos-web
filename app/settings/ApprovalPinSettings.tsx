'use client'

import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'

const PIN_LENGTH = 6

export function ApprovalPinSettings() {
  const [phase, setPhase] = useState<'idle' | 'set' | 'confirm'>('idle')
  const [firstPin, setFirstPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const activeDigits = phase === 'confirm' ? confirmPin : firstPin
  const setActiveDigits = phase === 'confirm' ? setConfirmPin : setFirstPin

  function handleKey(key: string) {
    if (saving) return
    if (key === 'backspace') {
      setActiveDigits(d => d.slice(0, -1))
      return
    }
    if (activeDigits.length >= PIN_LENGTH) return
    const next = activeDigits + key
    setActiveDigits(next)

    if (next.length === PIN_LENGTH && phase === 'set') {
      setPhase('confirm')
    }
  }

  async function handleSave() {
    if (phase === 'confirm' && confirmPin.length < 4) return
    if (phase === 'set' && firstPin.length < 4) return

    if (phase === 'set') {
      // enough digits entered — move to confirm
      setPhase('confirm')
      return
    }

    // confirm phase
    if (firstPin !== confirmPin) {
      setIsError(true)
      setMessage('PINs do not match. Try again.')
      setFirstPin('')
      setConfirmPin('')
      setPhase('set')
      return
    }

    setSaving(true)
    setMessage('')
    setIsError(false)
    try {
      const res = await fetch('/api/users/me/approval-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: firstPin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save PIN')
      setMessage('Approval PIN saved.')
      setPhase('idle')
      setFirstPin('')
      setConfirmPin('')
      setTimeout(() => setMessage(''), 4000)
    } catch (err: unknown) {
      setIsError(true)
      setMessage(err instanceof Error ? err.message : 'Failed to save PIN')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!confirm('Remove your approval PIN?')) return
    setSaving(true)
    setMessage('')
    setIsError(false)
    try {
      const res = await fetch('/api/users/me/approval-pin', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to clear PIN')
      setMessage('Approval PIN removed.')
      setPhase('idle')
      setFirstPin('')
      setConfirmPin('')
      setTimeout(() => setMessage(''), 4000)
    } catch (err: unknown) {
      setIsError(true)
      setMessage(err instanceof Error ? err.message : 'Failed to clear PIN')
    } finally {
      setSaving(false)
    }
  }

  const numpadKeys = ['1','2','3','4','5','6','7','8','9','','0','backspace']
  const displayDigits = activeDigits

  return (
    <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <ShieldCheck className="w-6 h-6 text-amber-500" />
        <div>
          <h2 className="text-xl font-bold text-gray-900">Approval PIN</h2>
          <p className="text-sm text-gray-500">
            Set a numeric PIN so you can approve POS transactions without typing your password.
            Only users with approval permission can set a PIN.
          </p>
        </div>
      </div>

      {phase === 'idle' ? (
        <div className="flex gap-3">
          <button
            onClick={() => { setPhase('set'); setMessage(''); setIsError(false) }}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            Set Approval PIN
          </button>
          <button
            onClick={handleClear}
            disabled={saving}
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            Remove PIN
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 max-w-xs">
          <p className="text-sm font-semibold text-gray-700">
            {phase === 'set'
              ? `Enter your new PIN (${firstPin.length}/${PIN_LENGTH})`
              : `Confirm your PIN (${confirmPin.length}/${PIN_LENGTH})`}
          </p>

          {/* Dot indicators */}
          <div className="flex gap-3">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-colors ${
                  i < displayDigits.length ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2 w-full">
            {numpadKeys.map((key, idx) => {
              if (key === '') return <div key={idx} />
              if (key === 'backspace') {
                return (
                  <button
                    key={key}
                    onClick={() => handleKey('backspace')}
                    disabled={saving}
                    className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 flex items-center justify-center transition-all"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6H6a2 2 0 00-2 2v8a2 2 0 002 2h6l6-6-6-6z" />
                    </svg>
                  </button>
                )
              }
              return (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  disabled={saving || displayDigits.length >= PIN_LENGTH}
                  className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-xl font-semibold text-gray-800 transition-all disabled:opacity-40"
                >
                  {key}
                </button>
              )
            })}
          </div>

          <div className="flex gap-2 w-full">
            <button
              onClick={handleSave}
              disabled={saving || displayDigits.length < 4}
              className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors"
            >
              {saving ? 'Saving…' : phase === 'set' ? 'Next →' : 'Save PIN'}
            </button>
            <button
              onClick={() => { setPhase('idle'); setFirstPin(''); setConfirmPin(''); setMessage(''); setIsError(false) }}
              className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-3 text-sm font-medium ${isError ? 'text-red-600' : 'text-green-600'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
