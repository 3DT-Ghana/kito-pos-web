'use client'

import { useEffect, useRef, useState } from 'react'
import { signOut } from 'next-auth/react'
import { LogOut, AlertTriangle, X } from 'lucide-react'

// ─── Manual sign-out confirm ────────────────────────────────────────────────

interface SignOutConfirmProps {
  open: boolean
  onClose: () => void
}

export function SignOutConfirmModal({ open, onClose }: SignOutConfirmProps) {
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handleSignOut = async () => {
    setLoading(true)
    await signOut({ callbackUrl: '/auth/login' })
  }

  return (
    <Backdrop onClose={onClose}>
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 p-6">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
          <LogOut className="w-6 h-6 text-red-500" strokeWidth={1.75} />
        </div>

        <h2 className="text-base font-bold text-gray-900">Sign out?</h2>
        <p className="mt-1.5 text-sm text-gray-500">
          You will be returned to the login page. Any unsaved changes will be lost.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSignOut}
            disabled={loading}
            className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading
              ? <><Spinner /> Signing out…</>
              : <><LogOut className="w-4 h-4" /> Sign out</>
            }
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

// ─── Idle warning countdown ─────────────────────────────────────────────────

const WARNING_SECS = 60

interface IdleWarningProps {
  open: boolean
  onStaySignedIn: () => void
}

export function IdleWarningModal({ open, onStaySignedIn }: IdleWarningProps) {
  const [secs, setSecs] = useState(WARNING_SECS)
  const interval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!open) {
      setSecs(WARNING_SECS)
      if (interval.current) clearInterval(interval.current)
      return
    }

    setSecs(WARNING_SECS)
    interval.current = setInterval(() => {
      setSecs(prev => {
        if (prev <= 1) {
          // Timer expires — sign-out is handled by useIdleTimeout; just clean up
          if (interval.current) clearInterval(interval.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (interval.current) clearInterval(interval.current)
    }
  }, [open])

  if (!open) return null

  const pct = (secs / WARNING_SECS) * 100
  const urgent = secs <= 15

  return (
    <Backdrop onClose={onStaySignedIn}>
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 p-6">
        {/* Icon */}
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${urgent ? 'bg-red-50' : 'bg-amber-50'}`}>
          <AlertTriangle className={`w-6 h-6 ${urgent ? 'text-red-500' : 'text-amber-500'}`} strokeWidth={1.75} />
        </div>

        <h2 className="text-base font-bold text-gray-900">Still there?</h2>
        <p className="mt-1.5 text-sm text-gray-500">
          You've been inactive. You'll be signed out automatically in{' '}
          <span className={`font-bold ${urgent ? 'text-red-600' : 'text-amber-600'}`}>{secs}s</span>.
        </p>

        {/* Countdown bar */}
        <div className="mt-4 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-1000 ${urgent ? 'bg-red-500' : 'bg-amber-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <button
          onClick={onStaySignedIn}
          className="mt-5 w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
        >
          Stay signed in
        </button>
      </div>
    </Backdrop>
  )
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Dim overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-sm">
        {children}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  )
}
