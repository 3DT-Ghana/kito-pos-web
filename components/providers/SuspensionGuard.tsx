'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'

const SUSPENDED_PATH = '/account-suspended'
const EXCLUDED_PATHS = ['/auth/', '/account-suspended', '/api/auth/', '/onboarding']

export function SuspensionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()

  useEffect(() => {
    // Only watch for tenant users (not admins or agents)
    if (!session?.user?.tenantId) return
    if (EXCLUDED_PATHS.some((p) => pathname.startsWith(p))) return

    const originalFetch = window.fetch

    window.fetch = async (...args) => {
      const response = await originalFetch(...args)

      if (response.status === 403) {
        try {
          const clone = response.clone()
          const data = await clone.json() as { message?: string; error?: string }
          const msg = data.message ?? data.error ?? ''

          if (
            msg.toLowerCase().includes('suspended') ||
            msg.toLowerCase().includes('deactivated')
          ) {
            router.replace(SUSPENDED_PATH)
          }
        } catch {
          // ignore JSON parse errors
        }
      }

      return response
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [session, pathname, router])

  return <>{children}</>
}
