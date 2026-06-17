'use client'

import { useRef, useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { ReactNode } from 'react'
import { Menu, LogOut, KeyRound, ChevronDown, X, Eye, EyeOff } from 'lucide-react'
import { useSession, signOut } from 'next-auth/react'
import { useEffect } from 'react'

interface AdminLayoutProps {
  children: ReactNode
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, cb])
}

function PasswordResetModal({ onClose }: { onClose: () => void }) {
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showCur,  setShowCur]  = useState(false)
  const [showNew,  setShowNew]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('New passwords do not match.'); return }
    if (next.length < 8)  { setError('New password must be at least 8 characters.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to change password.'); return }
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Change Password</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="px-5 py-8 text-center">
            <p className="text-green-600 font-semibold text-sm">Password changed successfully.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>
            )}

            {/* Current password */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Current password</label>
              <div className="relative">
                <input
                  type={showCur ? 'text' : 'password'}
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  required
                  className="w-full h-9 border border-gray-300 px-3 pr-9 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <button type="button" onClick={() => setShowCur(v => !v)}
                  className="absolute inset-y-0 right-0 w-9 flex items-center justify-center text-gray-400">
                  {showCur ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">New password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  required
                  className="w-full h-9 border border-gray-300 px-3 pr-9 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute inset-y-0 right-0 w-9 flex items-center justify-center text-gray-400">
                  {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Confirm */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                className="w-full h-9 border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full h-9 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Change Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function UserMenu() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [showPwModal, setShowPwModal] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  const name     = session?.user?.name  ?? 'Admin'
  const email    = session?.user?.email ?? ''
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-100 transition-colors"
        >
          <div className="w-7 h-7 bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {initials}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-gray-800 leading-tight">{name}</p>
            <p className="text-[10px] text-gray-400 leading-tight">{email}</p>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 shadow-lg z-50">
            {/* User info header */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-900 truncate">{name}</p>
              <p className="text-[11px] text-gray-400 truncate mt-0.5">{email}</p>
              <span className="inline-block mt-1.5 text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5">
                Administrator
              </span>
            </div>

            {/* Actions */}
            <div className="py-1">
              <button
                onClick={() => { setOpen(false); setShowPwModal(true) }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5 text-gray-400" />
                Change Password
              </button>
              <button
                onClick={() => signOut({ callbackUrl: '/auth/login' })}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>

      {showPwModal && <PasswordResetModal onClose={() => setShowPwModal(false)} />}
    </>
  )
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <AdminSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="md:pl-60 flex flex-col min-h-screen">

        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 h-14 flex items-center px-4 gap-3">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden flex items-center justify-center w-9 h-9 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <span className="text-sm font-bold text-gray-800 md:hidden">Admin</span>

          <div className="flex-1" />

          {/* User menu — top right */}
          <UserMenu />
        </header>

        <main className="flex-1 pb-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
            {children}
          </div>
        </main>

        <footer className="border-t border-gray-100 bg-white px-4 py-3">
          <p className="text-xs text-gray-400 text-center">
            <span className="font-semibold text-gray-500">Business Management</span>
            {' · '}Administration
          </p>
        </footer>
      </div>
    </div>
  )
}
