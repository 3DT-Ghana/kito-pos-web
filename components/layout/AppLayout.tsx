'use client'

import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { ReactNode } from 'react'
import { SidebarProvider, useSidebar } from '@/lib/sidebar/SidebarContext'
import { SessionGuard } from '@/lib/session/SessionGuard'

/**
 * App Layout Component
 *
 * Responsive layout:
 * - Mobile (<768px): Top header + bottom tab navigation
 * - Tablet/Desktop (>=768px): Collapsible sidebar + header
 *   Collapsed: icon rail (w-16), Expanded: full sidebar (w-64)
 */

interface AppLayoutProps {
  children: ReactNode
}

function AppLayoutInner({ children }: AppLayoutProps) {
  const { collapsed } = useSidebar()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop/Tablet Sidebar */}
      <Sidebar />

      {/* Main content area — offset tracks sidebar width */}
      <div
        className={`flex flex-col min-h-screen transition-all duration-200 ease-in-out ${
          collapsed ? 'md:pl-16' : 'md:pl-64'
        }`}
      >
        <Header />

        <main className="flex-1 pb-20 md:pb-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
            {children}
          </div>
        </main>

        {/* Branding footer — desktop only */}
        <footer className="hidden md:block border-t border-gray-100 bg-white px-6 py-3">
          <p className="text-xs text-gray-400 text-center">
            <span className="font-semibold text-gray-500">PETROS Business Management Mini</span>
            {' · '}Developed by <span className="font-semibold text-gray-500">EYO Solutions</span>
            {' · '}0246462398
          </p>
        </footer>
      </div>

      {/* Mobile Bottom Tab Navigation */}
      <BottomNav />
    </div>
  )
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <SessionGuard>
        <AppLayoutInner>{children}</AppLayoutInner>
      </SessionGuard>
    </SidebarProvider>
  )
}
