'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/hooks/useUser'
import { useTenantFeatures } from '@/hooks/useTenant'
import { useState } from 'react'

/**
 * Bottom Tab Navigation - Mobile Only
 *
 * Shown only on mobile (block md:hidden)
 * 5 key tabs + "More" drawer for secondary pages
 */

export function BottomNav() {
  const pathname = usePathname()
  const { user } = useUser()
  const { features } = useTenantFeatures()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const ALL_STAFF = ['OWNER', 'STORE_MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'STAFF']
  const role = user?.role || ''

  const tabs = [
    { name: 'Home',     href: '/dashboard', icon: HomeIcon },
    { name: 'Sales',    href: '/sales',     icon: SalesIcon },
    { name: 'Purchase', href: '/purchases', icon: PurchaseIcon },
    { name: 'Items',    href: '/items',     icon: ItemsIcon },
  ]

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/')

  const moreActive = !tabs.some(t => isActive(t.href))

  // "More" drawer groups — role-gated and feature-gated
  const moreGroups = [
    {
      label: 'Transactions',
      links: [
        features.enablePosTerminal && ['OWNER', 'STORE_MANAGER', 'CASHIER'].includes(role)
          ? { name: 'POS Terminal', href: '/pos', icon: '🖥️' } : null,
        { name: 'Payments',   href: '/payments',   icon: '💳' },
        { name: 'Returns',    href: '/returns',     icon: '↩️' },
        features.enableQuotations && ['OWNER', 'STORE_MANAGER', 'CASHIER'].includes(role)
          ? { name: 'Quotations', href: '/quotations', icon: '📄' } : null,
        features.enablePurchaseOrders && ['OWNER', 'STORE_MANAGER', 'INVENTORY_MANAGER'].includes(role)
          ? { name: 'Purchase Orders', href: '/purchase-orders', icon: '📋' } : null,
        features.enableExpenses && ['OWNER', 'STORE_MANAGER', 'ACCOUNTANT'].includes(role)
          ? { name: 'Expenses', href: '/expenses', icon: '💸' } : null,
        features.enableTill && ['OWNER', 'STORE_MANAGER', 'CASHIER'].includes(role)
          ? { name: 'Till', href: '/till', icon: '🏧' } : null,
      ].filter(Boolean) as { name: string; href: string; icon: string }[],
    },
    {
      label: 'Contacts',
      links: [
        { name: 'Customers',     href: '/customers',     icon: '👤' },
        { name: 'Suppliers',     href: '/suppliers',     icon: '🚚' },
        { name: 'Manufacturers', href: '/manufacturers', icon: '🏭' },
        { name: 'Categories',    href: '/categories',    icon: '🗂️' },
      ],
    },
    {
      label: 'Reports',
      links: [
        { name: 'Reports', href: '/reports', icon: '📈' },
      ],
    },
    {
      label: 'Account',
      links: [
        ALL_STAFF.includes(role)
          ? { name: 'Users', href: '/users', icon: '👥' } : null,
        features.enableBranches && role === 'OWNER'
          ? { name: 'Branches', href: '/branches', icon: '🏪' } : null,
        { name: 'Settings', href: '/settings', icon: '⚙️' },
        { name: 'Audit Log', href: '/audit-logs', icon: '🔍' },
      ].filter(Boolean) as { name: string; href: string; icon: string }[],
    },
    {
      label: 'Tools',
      links: [
        { name: 'Import Items',     href: '/import/items',             icon: '📥' },
        { name: 'Import Customers', href: '/import/customers',         icon: '📥' },
        { name: 'Bulk Adjust Stock',href: '/items/adjust-bulk',        icon: '🔧' },
        { name: 'Adjust Balances',  href: '/customers/adjust-balance', icon: '⚖️' },
      ],
    },
  ].filter(g => g.links.length > 0)

  return (
    <>
      {/* Bottom Tab Bar — visible on mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-gray-100 block md:hidden shadow-lg">
        <div className="flex items-stretch h-16">
          {tabs.map((tab) => {
            const active = isActive(tab.href)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
                  active
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon active={active} />
                <span className={`text-xs font-semibold ${active ? 'text-blue-600' : 'text-gray-500'}`}>
                  {tab.name}
                </span>
                {active && (
                  <div className="absolute bottom-0 h-0.5 w-8 bg-blue-600 rounded-full" />
                )}
              </Link>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              moreActive
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <MoreIcon active={moreActive} />
            <span className={`text-xs font-semibold ${moreActive ? 'text-blue-600' : 'text-gray-500'}`}>
              More
            </span>
          </button>
        </div>
      </nav>

      {/* More Drawer */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 block md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Bottom Sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl block md:hidden max-h-[80vh] overflow-y-auto">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            {/* User pill */}
            <div className="mx-4 mb-3 flex items-center gap-3 bg-blue-50 rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-base shrink-0">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
                <p className="text-xs text-gray-500">
                  {user?.role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
              </div>
              <Link
                href="/api/auth/signout"
                className="text-xs font-semibold text-red-600 hover:underline"
                onClick={() => setDrawerOpen(false)}
              >
                Sign out
              </Link>
            </div>

            <div className="px-4 pb-8 space-y-4">
              {moreGroups.map(group => (
                <div key={group.label}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.links.map(link => {
                      const active = isActive(link.href)
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setDrawerOpen(false)}
                          className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-center transition-colors ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <span className="text-2xl leading-none">{link.icon}</span>
                          <span className="text-xs font-semibold leading-tight">{link.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function SalesIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function PurchaseIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}

function ItemsIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )
}

function MoreIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
