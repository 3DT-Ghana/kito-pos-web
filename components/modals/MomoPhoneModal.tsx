'use client'

import { useState, useEffect, useRef } from 'react'
import { MOMO_CHANNELS, type MomoChannel } from '@/lib/momo/hubtelVerify'

interface MomoPhoneModalProps {
  open: boolean
  initialValue?: string
  /** Skip verification entirely — used when the payment gateway is off. */
  skipVerification?: boolean
  /** The network is returned too: Hubtel requires it with the payment. */
  onAccept: (phone: string, channel: MomoChannel) => void
  onClose: () => void
}

interface VerifyState {
  isRegistered?: boolean
  name?: string
  status?: string
  profile?: string
  error?: string
  unconfigured?: boolean
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '⌫']
const CHANNEL_KEY = 'momoChannel'

/**
 * MoMo number entry, with verification before the payment prompt is sent.
 *
 * A mistyped digit otherwise sends the prompt to a stranger's phone: they
 * decline, and the sale stalls while the cashier works out why nothing
 * arrived. Verification catches it first by showing the name on the wallet.
 *
 * Verification never blocks a sale. If Hubtel is unreachable, unconfigured, or
 * the number simply cannot be verified, the cashier is told and can continue —
 * a payment provider outage must not stop trading.
 */
export function MomoPhoneModal({
  open,
  initialValue = '',
  skipVerification = false,
  onAccept,
  onClose,
}: MomoPhoneModalProps) {
  const [value, setValue] = useState(initialValue)
  const [channel, setChannel] = useState<MomoChannel>('mtn-gh')
  const [isVerifying, setIsVerifying] = useState(false)
  const [result, setResult] = useState<VerifyState | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    setResult(null)
    setIsVerifying(false)
    // Most tills serve one dominant network, so remember the last choice.
    try {
      const saved = localStorage.getItem(CHANNEL_KEY)
      if (MOMO_CHANNELS.some((c) => c.value === saved)) setChannel(saved as MomoChannel)
    } catch {
      // storage unavailable — the default stands
    }
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open, initialValue])

  if (!open) return null

  const phone = value.trim()
  const valid = phone.length >= 9

  const pressDigit = (d: string) => {
    if (d === '*') return
    setResult(null) // the number changed, so any previous check is stale
    if (d === '⌫') {
      setValue((v) => v.slice(0, -1))
      return
    }
    if (value.length >= 12) return
    setValue((v) => v + d)
  }

  const pickChannel = (c: MomoChannel) => {
    setChannel(c)
    setResult(null)
    try {
      localStorage.setItem(CHANNEL_KEY, c)
    } catch {
      // ignore
    }
  }

  const commit = () => {
    onAccept(phone, channel)
    onClose()
  }

  const handleAccept = async () => {
    if (!valid || isVerifying) return

    // Nothing to verify against when no prompt will be sent — the number is
    // being recorded by hand.
    if (skipVerification) {
      commit()
      return
    }

    setIsVerifying(true)
    try {
      const res = await fetch('/api/momo/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, channel }),
      })
      const data = await res.json()

      if (res.status === 429) {
        setResult({ error: data.error })
        return
      }
      // A verified, registered number needs no confirmation step for the
      // cashier to click through — but they should still see whose it is.
      setResult({
        isRegistered: data.isRegistered,
        name: data.name,
        status: data.status,
        profile: data.profile,
        error: data.success ? undefined : data.error,
        unconfigured: data.unconfigured,
      })
    } catch {
      setResult({ error: 'Could not reach the verification service.' })
    } finally {
      setIsVerifying(false)
    }
  }

  const channelLabel = MOMO_CHANNELS.find((c) => c.value === channel)?.label ?? ''
  const isBusinessWallet = result?.profile === 'Agent' || result?.profile === 'Merchant'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-xs shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <p className="text-sm font-bold text-gray-900">
            {result ? 'Check the number' : 'Enter MoMo Number'}
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* ── Confirmation step ── */}
        {result ? (
          <div className="p-4 space-y-3">
            <div className="text-center">
              <p className="text-xl font-black tracking-widest text-gray-900">{phone}</p>
              <p className="text-xs text-gray-500">{channelLabel}</p>
            </div>

            {result.name && result.isRegistered && (
              <div className="border-2 border-green-200 bg-green-50 px-3 py-2.5 text-center">
                <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">
                  Registered to
                </p>
                <p className="font-bold text-green-900 leading-tight">{result.name}</p>
                <p className="text-xs text-green-700 mt-0.5">
                  {[result.profile, result.status].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}

            {result.isRegistered === false && (
              <div className="border-2 border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <p className="font-bold">Not registered on {channelLabel}</p>
                <p className="text-xs mt-0.5">
                  Check the number, or try a different network. You can still send the
                  prompt, but it is likely to fail.
                </p>
              </div>
            )}

            {/* Paying a vendor rather than a customer is usually a mistake. */}
            {isBusinessWallet && result.isRegistered && (
              <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                This is a <strong>{result.profile}</strong> wallet, not a personal one.
              </div>
            )}

            {result.error && result.isRegistered === undefined && (
              <div className="border-2 border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                <p className="font-semibold">Could not verify this number</p>
                <p className="text-xs mt-0.5">{result.error}</p>
                <p className="text-xs mt-1 text-gray-500">
                  You can still continue — verification is a check, not a requirement.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50"
              >
                Change
              </button>
              <button
                type="button"
                onClick={commit}
                className={`flex-[2] py-3 text-white font-bold text-sm ${
                  result.isRegistered === false
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {result.isRegistered === false ? 'Send anyway' : 'Confirm'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Entry step ── */
          <>
            {!skipVerification && (
              <div className="px-4 pt-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                  Network
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {MOMO_CHANNELS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => pickChannel(c.value)}
                      className={`py-2 text-xs font-bold transition-colors ${
                        channel === c.value
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="px-4 pt-3 pb-2">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="tel"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value.replace(/\D/g, '').slice(0, 12))
                  setResult(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleAccept()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    onClose()
                  }
                }}
                placeholder="0244 123 456"
                className="w-full px-4 py-3 border-2 border-indigo-300 focus:border-indigo-600 focus:outline-none text-xl font-bold tracking-widest text-center"
              />
              <p className="text-xs text-gray-400 text-center mt-1">
                {valid ? `✓ ${phone.length} digits` : 'Enter at least 9 digits'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-px bg-gray-200 mx-4 mb-4">
              {DIGITS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pressDigit(d)}
                  className={`py-4 text-lg font-bold bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors ${
                    d === '⌫' ? 'text-red-500' : d === '*' ? 'invisible' : 'text-gray-900'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

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
                onClick={() => void handleAccept()}
                disabled={!valid || isVerifying}
                className="flex-1 py-3 bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isVerifying ? 'Checking…' : skipVerification ? 'Accept' : 'Check number'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
