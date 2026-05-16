'use client'

import { AdminSidebar } from './AdminSidebar'
import { ReactNode } from 'react'

interface AdminLayoutProps {
  children: ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar />

      {/* Main content — fixed offset for sidebar */}
      <div className="md:pl-60 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-4">
          <div className="flex-1" />
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1">
            Platform Admin
          </span>
        </header>

        <main className="flex-1 pb-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
        </main>

        <footer className="border-t border-gray-100 bg-white px-6 py-3">
          <p className="text-xs text-gray-400 text-center">
            <span className="font-semibold text-gray-500">PETROS Business Management</span>
            {' · '}Platform Administration
          </p>
        </footer>
      </div>
    </div>
  )
}
