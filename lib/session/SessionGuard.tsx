'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'
import { SignOutConfirmModal, IdleWarningModal } from '@/components/auth/SignOutModal'

interface SessionGuardCtx {
  openSignOut: () => void
}

const Ctx = createContext<SessionGuardCtx>({ openSignOut: () => {} })

export function useSessionGuard() {
  return useContext(Ctx)
}

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const [signOutOpen, setSignOutOpen]   = useState(false)
  const [idleWarning, setIdleWarning]   = useState(false)

  const handleWarning  = useCallback(() => setIdleWarning(true), [])
  const handleDismiss  = useCallback(() => setIdleWarning(false), [])

  useIdleTimeout({ onWarning: handleWarning, onDismiss: handleDismiss })

  return (
    <Ctx.Provider value={{ openSignOut: () => setSignOutOpen(true) }}>
      {children}

      <SignOutConfirmModal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
      />

      <IdleWarningModal
        open={idleWarning}
        onStaySignedIn={() => {
          setIdleWarning(false)
          // touching state resets the idle timers via activity event
          window.dispatchEvent(new MouseEvent('mousemove'))
        }}
      />
    </Ctx.Provider>
  )
}
