'use client'

import { useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { ReactNode } from 'react'
import { Menu } from 'lucide-react'

interface AdminLayoutProps {
  children: ReactNode
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

          <span className="text-sm font-bold text-gray-800 md:hidden">Platform Admin</span>

          <div className="flex-1" />

          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 -full px-3 py-1">
            Platform Admin
          </span>
        </header>

        <main className="flex-1 pb-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
            {children}
          </div>
        </main>

        <footer className="border-t border-gray-100 bg-white px-4 py-3">
          <p className="text-xs text-gray-400 text-center">
            <span className="font-semibold text-gray-500">Business Management</span>
            {' · '}Platform Administration
          </p>
        </footer>
      </div>
    </div>
  )
}
