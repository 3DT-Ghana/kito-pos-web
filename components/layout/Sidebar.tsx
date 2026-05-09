'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useUser } from '@/hooks/useUser'
import { useTenantFeatures } from '@/hooks/useTenant'
import { useSidebar } from '@/lib/sidebar/SidebarContext'

/**
 * Sidebar Navigation Component
 *
 * Desktop/Tablet sidebar - hidden on mobile (md:flex)
 * Collapsible: full (w-64) ↔ icon rail (w-16)
 *
 * Groups (like QuickBooks / Odoo pattern):
 *  - Main         : Dashboard, POS Terminal
 *  - Sales        : Sales, Quotations, Returns (customer side)
 *  - Purchasing   : Purchases, Purchase Orders, Returns (supplier side)
 *  - Inventory    : Items, Manufacturers, Stock Adjustments
 *  - Finance      : Payments, Expenses, Till / Cash Register
 *  - CRM          : Customers, Suppliers
 *  - Reports      : Reports, Audit Log
 *  - Admin        : Users, Branches, Settings, Import / Tools
 */

interface NavItem {
  name: string
  href: string
  icon: string
}

interface NavGroup {
  label: string
  icon: string         // group icon shown in collapsed rail tooltip header
  items: NavItem[]
}

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useUser()
  const { features } = useTenantFeatures()
  const { collapsed, toggle } = useSidebar()
  const role = user?.role || ''

  const ALL = ['OWNER', 'STORE_MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'STAFF']
  const has = (...roles: string[]) => roles.includes(role)
  const isSuperAdmin = user?.email === 'ee.wilson@outlook.com'

  // Build nav groups — items with show: false are filtered out
  const rawGroups = [
    {
      label: 'Main',
      icon: '🏠',
      itemsRaw: [
        { name: 'Dashboard',    href: '/dashboard', icon: '📊', show: true },
        { name: 'POS Terminal', href: '/pos',       icon: '🖥️', show: features.enablePosTerminal && has('OWNER','STORE_MANAGER','CASHIER') },
      ],
    },
    {
      label: 'Sales',
      icon: '💰',
      itemsRaw: [
        { name: 'Sales',       href: '/sales',       icon: '💰', show: true },
        { name: 'Quotations',  href: '/quotations',  icon: '📄', show: features.enableQuotations && has('OWNER','STORE_MANAGER','CASHIER') },
        { name: 'Returns',     href: '/returns',     icon: '↩️', show: has('OWNER','STORE_MANAGER','STAFF') },
      ],
    },
    {
      label: 'Purchasing',
      icon: '🛒',
      itemsRaw: [
        { name: 'Purchases',        href: '/purchases',        icon: '🛒', show: true },
        { name: 'Purchase Orders',  href: '/purchase-orders',  icon: '📋', show: features.enablePurchaseOrders && has('OWNER','STORE_MANAGER','INVENTORY_MANAGER') },
      ],
    },
    {
      label: 'Inventory',
      icon: '📦',
      itemsRaw: [
        { name: 'Items',         href: '/items',         icon: '📦', show: true },
        { name: 'Categories',    href: '/categories',    icon: '🗂️', show: true },
        { name: 'Manufacturers', href: '/manufacturers', icon: '🏭', show: true },
      ],
    },
    {
      label: 'Finance',
      icon: '💳',
      itemsRaw: [
        { name: 'Payments',  href: '/payments',  icon: '💳', show: true },
        { name: 'Expenses',  href: '/expenses',  icon: '💸', show: features.enableExpenses && has('OWNER','STORE_MANAGER','ACCOUNTANT') },
        { name: 'Till',      href: '/till',      icon: '🏧', show: features.enableTill && has('OWNER','STORE_MANAGER','CASHIER') },
      ],
    },
    {
      label: 'CRM',
      icon: '👥',
      itemsRaw: [
        { name: 'Customers', href: '/customers', icon: '👤', show: true },
        { name: 'Suppliers',  href: '/suppliers', icon: '🚚', show: true },
      ],
    },
    {
      label: 'Reports',
      icon: '📈',
      itemsRaw: [
        { name: 'Reports',   href: '/reports',     icon: '📈', show: true },
        { name: 'Audit Log', href: '/audit-logs',  icon: '🔍', show: has('OWNER','STORE_MANAGER') },
      ],
    },
    {
      label: 'Admin',
      icon: '⚙️',
      itemsRaw: [
        { name: 'Users',            href: '/users',                    icon: '👥', show: has('OWNER') },
        { name: 'Branches',         href: '/branches',                 icon: '🏪', show: features.enableBranches && has('OWNER') },
        { name: 'Settings',         href: '/settings',                 icon: '⚙️', show: has('OWNER') },
        { name: 'Import Items',     href: '/import/items',             icon: '📥', show: ALL.includes(role) },
        { name: 'Import Customers', href: '/import/customers',         icon: '📥', show: ALL.includes(role) },
        { name: 'Adjust Stock',     href: '/items/adjust-bulk',        icon: '🔧', show: ALL.includes(role) },
        { name: 'Adjust Balances',  href: '/customers/adjust-balance', icon: '⚖️', show: ALL.includes(role) },
      ],
    },
    {
      label: 'Platform',
      icon: '🌐',
      itemsRaw: [
        { name: 'All Companies', href: '/admin', icon: '🏢', show: isSuperAdmin },
      ],
    },
  ]

  // Filter items and groups
  const groups: (NavGroup & { defaultOpen: boolean })[] = rawGroups
    .map(g => ({
      label: g.label,
      icon: g.icon,
      items: g.itemsRaw.filter(i => i.show).map(({ show: _s, ...i }) => i),
      defaultOpen: g.itemsRaw.filter(i => i.show).some(
        i => pathname === i.href || pathname?.startsWith(i.href + '/')
      ),
    }))
    .filter(g => g.items.length > 0)

  // Track which groups are expanded
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map(g => [g.label, g.defaultOpen]))
  )

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/')

  return (
    <aside
      className={`hidden md:flex flex-col fixed inset-y-0 z-30 transition-all duration-200 ease-in-out ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex flex-col grow bg-white border-r border-gray-200 pb-4 overflow-y-auto overflow-x-hidden shadow-sm">

        {/* Logo / Brand + collapse toggle */}
        <div className={`flex items-center shrink-0 h-14 border-b border-gray-100 ${collapsed ? 'justify-center px-0' : 'px-4 gap-3'}`}>
          {collapsed ? (
            <button
              onClick={toggle}
              title="Expand sidebar"
              className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-xl shadow-md hover:bg-blue-700 transition-colors"
            >
              🏪
            </button>
          ) : (
            <>
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-xl shadow-md shrink-0">
                🏪
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-bold text-gray-900 leading-tight truncate">PETROS Business</h1>
                <p className="text-xs text-gray-500">Management Mini</p>
              </div>
              <button
                onClick={toggle}
                title="Collapse sidebar"
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className={`flex-1 py-2 space-y-0 ${collapsed ? 'px-2' : 'px-2'}`}>
          {groups.map((group) => {
            const groupActive = group.items.some(i => isActive(i.href))
            const isOpen = openGroups[group.label] ?? group.defaultOpen

            if (collapsed) {
              // Collapsed rail: show each item as icon-only with tooltip
              return (
                <div key={group.label} className="space-y-0.5 py-1 border-b border-gray-100 last:border-0">
                  {group.items.map(item => {
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={`${group.label}: ${item.name}`}
                        className={`flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all ${
                          active
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span className="text-lg">{item.icon}</span>
                      </Link>
                    )
                  })}
                </div>
              )
            }

            // Expanded: group header + collapsible items
            return (
              <div key={group.label} className="pt-1">
                {/* Group header button */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                    groupActive
                      ? 'text-blue-700'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-sm">{group.icon}</span>
                  <span className="flex-1 text-left">{group.label}</span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Group items */}
                {isOpen && (
                  <div className="ml-2 pl-3 border-l-2 border-gray-100 space-y-0.5 mb-1 mt-0.5">
                    {group.items.map(item => {
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium rounded-lg transition-all ${
                            active
                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          <span className="text-base shrink-0">{item.icon}</span>
                          <span className="truncate">{item.name}</span>
                          {active && (
                            <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full opacity-70 shrink-0" />
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* User Info */}
        <div className={`shrink-0 border-t border-gray-200 ${collapsed ? 'p-2' : 'p-3'}`}>
          {collapsed ? (
            <div
              title={`${user?.name} · ${user?.role}`}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-base shadow-md mx-auto"
            >
              {user?.name?.charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
                <p className="text-xs font-medium text-gray-500">
                  {user?.role?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </p>
              </div>
              <Link
                href="/api/auth/signout"
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                title="Sign out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
