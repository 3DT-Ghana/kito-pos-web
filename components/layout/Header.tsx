'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/hooks/useUser'
import { useState } from 'react'
import { BranchSelector } from '@/components/layout/BranchSelector'
import { useSidebar } from '@/lib/sidebar/SidebarContext'
import { useSessionGuard } from '@/lib/session/SessionGuard'
import { Menu, Settings, Users, Download, Sliders, Scale, LogOut, ChevronDown } from 'lucide-react'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/sales': 'Sales',
  '/sales/new': 'New Sale',
  '/purchases': 'Purchases',
  '/purchases/new': 'New Purchase',
  '/items': 'Inventory',
  '/transfers': 'Stock Transfers',
  '/items/new': 'Add Item',
  '/manufacturers': 'Manufacturers',
  '/customers': 'Customers',
  '/suppliers': 'Suppliers',
  '/payments': 'Payments',
  '/quotations': 'Quotations',
  '/quotations/new': 'New Quotation',
  '/purchase-orders': 'Purchase Orders',
  '/purchase-orders/new': 'New Purchase Order',
  '/expenses': 'Expenses',
  '/expenses/new': 'Add Expense',
  '/audit-logs': 'Audit Log',
  '/till': 'Till / Cash Register',
  '/reports': 'Reports',
  '/users': 'Users & Permissions',
  '/settings': 'Settings',
  '/branches': 'Branches',
  '/import/items': 'Import Items',
  '/import/customers': 'Import Customers',
  '/items/adjust-bulk': 'Bulk Stock Adjustment',
  '/customers/adjust-balance': 'Adjust Customer Balances',
  '/returns': 'Returns',
  '/admin': 'Platform Admin',
  '/adjustments': 'Stock Adjustments',
}

export function Header() {
  const { user } = useUser()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const { toggle } = useSidebar()
  const { openSignOut } = useSessionGuard()

  const pageTitle = Object.entries(PAGE_TITLES).find(([key]) =>
    pathname === key || pathname?.startsWith(key + '/')
  )?.[1] || 'Management'

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const roleLabel = user?.role?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? ''

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="px-4 sm:px-6">
        <div className="flex h-14 items-center gap-3">

          {/* Sidebar toggle — desktop only */}
          <button
            onClick={toggle}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Page title */}
          <h1 className="text-sm font-semibold text-gray-900 hidden md:block">{pageTitle}</h1>

          {/* Mobile: app name */}
          <span className="text-sm font-bold text-gray-900 md:hidden">PETROS</span>

          <div className="flex-1" />

          {/* Branch selector */}
          <BranchSelector />

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-md bg-slate-800 flex items-center justify-center text-white text-xs font-bold">
                {initials}
              </div>
              <span className="hidden sm:block font-medium text-gray-700 text-sm">{user?.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 hidden sm:block" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-lg bg-white ring-1 ring-black/5 z-20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{roleLabel}</p>
                  </div>
                  <div className="py-1">
                    <MenuLink href="/settings"              icon={<Settings className="w-4 h-4" />}  label="Settings"          onClick={() => setMenuOpen(false)} />
                    <MenuLink href="/users"                 icon={<Users className="w-4 h-4" />}     label="Users"             onClick={() => setMenuOpen(false)} />
                    <div className="my-1 border-t border-gray-100" />
                    <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tools</p>
                    <MenuLink href="/import/items"             icon={<Download className="w-4 h-4" />}  label="Import Items"      onClick={() => setMenuOpen(false)} />
                    <MenuLink href="/import/customers"         icon={<Download className="w-4 h-4" />}  label="Import Customers"  onClick={() => setMenuOpen(false)} />
                    <MenuLink href="/items/adjust-bulk"        icon={<Sliders className="w-4 h-4" />}   label="Bulk Adjust Stock" onClick={() => setMenuOpen(false)} />
                    <MenuLink href="/customers/adjust-balance" icon={<Scale className="w-4 h-4" />}     label="Adjust Balances"   onClick={() => setMenuOpen(false)} />
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      onClick={() => { setMenuOpen(false); openSignOut() }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function MenuLink({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
    >
      <span className="text-gray-400">{icon}</span>
      {label}
    </Link>
  )
}
