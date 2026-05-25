'use client'

import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { LayoutDashboard, FileText, User, LogOut, AlertCircle } from 'lucide-react'

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const isPublicAuthPage =
    pathname === '/agent/login' || pathname === '/agent/register'
  const isBlockedAgent =
    session?.user.platformRole === 'AGENT' &&
    ['SUSPENDED', 'REJECTED', 'REVOKED'].includes(session.user.agentStatus ?? '')
  const isPending = session?.user.agentStatus === 'PENDING'

  useEffect(() => {
    if (isPublicAuthPage || status === 'loading') return

    if (!session || session.user.platformRole !== 'AGENT') {
      router.replace('/agent/login')
      return
    }

    if (isBlockedAgent) {
      router.replace('/agent/login')
      return
    }

    if (isPending && pathname !== '/agent/profile') {
      router.replace('/agent/profile')
    }
  }, [isBlockedAgent, isPending, isPublicAuthPage, pathname, router, session, status])

  if (isPublicAuthPage) {
    return <>{children}</>
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent -full animate-spin" />
      </div>
    )
  }

  if (!session || session.user.platformRole !== 'AGENT') {
    return null
  }

  if (isBlockedAgent) {
    return null
  }

  const navItems = [
    { href: '/agent/profile', label: 'Profile', icon: User, alwaysShow: true },
    { href: '/agent/dashboard', label: 'Dashboard', icon: LayoutDashboard, alwaysShow: false },
    { href: '/agent/applications', label: 'Applications', icon: FileText, alwaysShow: false },
  ].filter((item) => item.alwaysShow || !isPending)

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest">Agent Portal</p>
          <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{session.user.name}</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 pb-4">
          <button
            onClick={() => signOut({ callbackUrl: '/agent/login' })}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {isPending && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              Your account is pending approval. Please complete any required KYC updates on the{' '}
              <Link href="/agent/profile" className="font-medium underline">
                Profile
              </Link>{' '}
              page to speed up the review.
            </span>
          </div>
        )}
        <div className="flex-1 p-6">{children}</div>
      </main>
    </div>
  )
}
