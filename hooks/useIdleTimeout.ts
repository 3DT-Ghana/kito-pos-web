'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { signOut } from 'next-auth/react'

const FALLBACK_IDLE_MS  = 5 * 60 * 1000
const FALLBACK_SESS_MS  = 4 * 60 * 60 * 1000
const WARNING_MS        = 60 * 1000  // show warning 60 s before idle sign-out

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click',
] as const

interface Options {
  onWarning: () => void
  onDismiss: () => void
}

export function useIdleTimeout({ onWarning, onDismiss }: Options) {
  const idleTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isWarning    = useRef(false)

  // Loaded from platform settings; fall back to hardcoded defaults while fetching.
  const [idleMs,  setIdleMs]  = useState(FALLBACK_IDLE_MS)
  const [sessMs,  setSessMs]  = useState(FALLBACK_SESS_MS)
  const [ready,   setReady]   = useState(false)

  useEffect(() => {
    fetch('/api/admin/session-settings')
      .then(r => r.json())
      .then(data => {
        if (data.idleTimeoutMinutes) setIdleMs(data.idleTimeoutMinutes * 60 * 1000)
        if (data.sessionMaxHours)    setSessMs(data.sessionMaxHours * 60 * 60 * 1000)
      })
      .catch(() => {/* keep defaults */})
      .finally(() => setReady(true))
  }, [])

  const clearIdleTimers = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (warnTimer.current) clearTimeout(warnTimer.current)
  }

  const reset = useCallback(() => {
    clearIdleTimers()

    if (isWarning.current) {
      isWarning.current = false
      onDismiss()
    }

    warnTimer.current = setTimeout(() => {
      isWarning.current = true
      onWarning()
    }, idleMs - WARNING_MS)

    idleTimer.current = setTimeout(() => {
      signOut({ callbackUrl: '/auth/login?reason=idle' })
    }, idleMs)
  }, [idleMs, onWarning, onDismiss])

  useEffect(() => {
    if (!ready) return

    reset()

    // Absolute session limit — set once, never reset by activity.
    sessionTimer.current = setTimeout(() => {
      signOut({ callbackUrl: '/auth/login?reason=session_expired' })
    }, sessMs)

    const handleActivity = () => reset()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))

    return () => {
      clearIdleTimers()
      if (sessionTimer.current) clearTimeout(sessionTimer.current)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity))
    }
  }, [ready, reset, sessMs])
}
