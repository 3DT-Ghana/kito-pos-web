'use client'

import { useEffect, useRef, useCallback } from 'react'
import { signOut } from 'next-auth/react'

const IDLE_MS      = 5 * 60 * 1000  // 5 minutes
const WARNING_MS   = 60 * 1000       // show warning 60 s before sign-out

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click',
] as const

interface Options {
  onWarning: () => void   // called when 60 s remain
  onDismiss: () => void   // hide warning (user was active)
}

export function useIdleTimeout({ onWarning, onDismiss }: Options) {
  const idleTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isWarning    = useRef(false)

  const clearTimers = () => {
    if (idleTimer.current)  clearTimeout(idleTimer.current)
    if (warnTimer.current)  clearTimeout(warnTimer.current)
  }

  const reset = useCallback(() => {
    clearTimers()

    if (isWarning.current) {
      isWarning.current = false
      onDismiss()
    }

    // Warn 60 s before auto sign-out
    warnTimer.current = setTimeout(() => {
      isWarning.current = true
      onWarning()
    }, IDLE_MS - WARNING_MS)

    // Sign out after full idle period
    idleTimer.current = setTimeout(() => {
      signOut({ callbackUrl: '/auth/login?reason=idle' })
    }, IDLE_MS)
  }, [onWarning, onDismiss])

  useEffect(() => {
    reset()

    const handleActivity = () => reset()

    ACTIVITY_EVENTS.forEach(e =>
      window.addEventListener(e, handleActivity, { passive: true })
    )

    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach(e =>
        window.removeEventListener(e, handleActivity)
      )
    }
  }, [reset])
}
