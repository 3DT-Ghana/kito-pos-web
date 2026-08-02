'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/hooks/useUser'
import { useTenantFeatures } from '@/hooks/useTenant'
import { useState } from 'react'
import {
  LayoutDashboard, ShoppingCart, Package, TrendingDown, MoreHorizontal,
  Monitor, CreditCard, CornerUpLeft, FileText, ClipboardCheck, Receipt,
  Landmark, ArrowLeftRight, Users, Truck, Factory, Tag, BarChart2,
  ClipboardList, UserCog, GitBranch, Settings, Download, Sliders,
  Scale, LogOut, X,
} from 'lucide-react'

export function BottomNav() {
  const pathname = usePathname()
  const { user } = useUser()
  const { features } = useTenantFeatures()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const role = user?.role || ''
  const has = (...roles: string[]) => roles.includes(role)

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/')

  const tabs = [
    { name: 'Home',     href: '/dashboard', Icon: LayoutDashboard },
    { name: 'Sales',    href: '/sales',     Icon: ShoppingCart },
    { name: 'Purchase', href: '/purchases', Icon: TrendingDown },
    { name: 'Items',    href: '/items',     Icon: Package },
  ]

  const moreActive = !tabs.some(t => isActive(t.href))

  const moreGroups = [
    {
      label: 'Transactions',
      links: [
        features.enablePosTerminal && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','CASHIER')
          ? { name: 'POS Terminal',    href: '/pos',            Icon: Monitor }        : null,
        { name: 'Payments',            href: '/payments',       Icon: CreditCard },
        { name: 'Returns',             href: '/returns',        Icon: CornerUpLeft },
        features.enableQuotations && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','CASHIER')
          ? { name: 'Quotations',      href: '/quotations',     Icon: FileText }       : null,
        features.enablePurchaseOrders && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','INVENTORY_MANAGER')
          ? { name: 'Purchase Orders', href: '/purchase-orders',Icon: ClipboardCheck } : null,
        features.enableExpenses && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT')
          ? { name: 'Expenses',        href: '/expenses',       Icon: Receipt }        : null,
        features.enableTill && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','CASHIER')
          ? { name: 'Till',            href: '/till',           Icon: Landmark }       : null,
        features.enableBranches && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','INVENTORY_MANAGER')
          ? { name: 'Transfers',       href: '/transfers',      Icon: ArrowLeftRight } : null,
      ].filter(Boolean) as { name: string; href: string; Icon: React.ElementType }[],
    },
    {
      label: 'Contacts',
      links: [
        { name: 'Customers',     href: '/customers',     Icon: Users },
        { name: 'Suppliers',     href: '/suppliers',     Icon: Truck },
        { name: 'Manufacturers', href: '/manufacturers', Icon: Factory },
        { name: 'Categories',    href: '/categories',    Icon: Tag },
      ],
    },
    {
      label: 'Reports',
      links: [
        { name: 'Reports',   href: '/reports',    Icon: BarChart2 },
        has('OWNER','STORE_MANAGER')
          ? { name: 'Audit Log', href: '/audit-logs', Icon: ClipboardList } : null,
      ].filter(Boolean) as { name: string; href: string; Icon: React.ElementType }[],
    },
    {
      label: 'Account',
      links: [
        has('OWNER','BRANCH_MANAGER')
          ? { name: 'Users',     href: '/users',     Icon: UserCog }    : null,
        features.enableBranches && role === 'OWNER'
          ? { name: 'Branches',  href: '/branches',  Icon: GitBranch }  : null,
        role === 'OWNER'
          ? { name: 'Settings',  href: '/settings',  Icon: Settings }   : null,
      ].filter(Boolean) as { name: string; href: string; Icon: React.ElementType }[],
    },
    {
      label: 'Tools',
      links: [
        { name: 'Import Items',     href: '/import/items',             Icon: Download },
        { name: 'Import Customers', href: '/import/customers',         Icon: Download },
        { name: 'Adjust Stock',     href: '/items/adjust-bulk',        Icon: Sliders  },
        { name: 'Adjust Balances',  href: '/customers/adjust-balance', Icon: Scale    },
      ],
    },
  ].filter(g => g.links.length > 0)

  return (
    <>
      {/* Tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 block md:hidden">
        <div className="flex items-stretch h-16">
          {tabs.map(({ href, name, Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative ${
                  active ? 'text-blue-600' : 'text-gray-400'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.75} />
                <span className={`text-xs font-medium ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                  {name}
                </span>
                {active && <div className="absolute top-0 h-0.5 w-8 bg-blue-600 -full" />}
              </Link>
            )
          })}

          <button
            onClick={() => setDrawerOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              moreActive ? 'text-blue-600' : 'text-gray-400'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={moreActive ? 2.5 : 1.75} />
            <span className={`text-xs font-medium ${moreActive ? 'text-blue-600' : 'text-gray-400'}`}>
              More
            </span>
            {moreActive && <div className="absolute top-0 h-0.5 w-8 bg-blue-600 -full" />}
          </button>
        </div>
      </nav>

      {/* More drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 block md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white  shadow-2xl block md:hidden max-h-[85vh] flex flex-col">

            {/* Handle + header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
              <span className="text-sm font-semibold text-gray-700">Menu</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5 pb-8">
              {moreGroups.map(group => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.links.map(link => {
                      const { Icon } = link
                      const active = isActive(link.href)
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setDrawerOpen(false)}
                          className={`flex flex-col items-center gap-2 py-3 px-2 text-center transition-colors ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <Icon className="w-5 h-5" strokeWidth={1.75} />
                          <span className="text-xs font-medium leading-tight">{link.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Sign out */}
              <div className="border-t border-gray-100 pt-4">
                <Link
                  href="/api/auth/signout"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </Link>
                <p className="text-[10px] text-gray-300 text-center mt-3 pb-1">
                  System Developed EYO Solutions | 0246462398
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
