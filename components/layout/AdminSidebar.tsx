'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  LayoutDashboard, Users, Building2, ClipboardList,
  FileText, ShieldCheck, LogOut, ChevronDown, BarChart2, X, Settings2,
  Layers, Package, Wallet, Receipt, TrendingUp, Timer,
} from 'lucide-react'
import { useState } from 'react'

interface NavItem {
  name: string
  href: string
  icon: React.ReactNode
  badge?: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const sz = 'w-4 h-4'

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/admin', icon: <LayoutDashboard className={sz} /> },
    ],
  },
  {
    label: 'Onboarding',
    items: [
      { name: 'Business Applications', href: '/admin/applications', icon: <FileText className={sz} /> },
      { name: 'Sales Agents',          href: '/admin/agents',       icon: <Users className={sz} /> },
    ],
  },
  {
    label: 'Companies',
    items: [
      { name: 'All Companies', href: '/admin/companies', icon: <Building2 className={sz} /> },
    ],
  },
  {
    label: 'Reports',
    items: [
      { name: 'Platform Reports', href: '/admin/reports', icon: <BarChart2 className={sz} /> },
    ],
  },
  {
    label: 'Billing',
    items: [
      { name: 'Module Setup',    href: '/admin/module-setup',    icon: <Layers className={sz} /> },
      { name: 'Hardware Items',  href: '/admin/business-items',  icon: <Package className={sz} /> },
      { name: 'Tenant Plans',    href: '/admin/tenant-plans',    icon: <Wallet className={sz} /> },
      { name: 'Invoices',        href: '/admin/invoices',        icon: <Receipt className={sz} /> },
      { name: 'Commissions',     href: '/admin/commissions',     icon: <TrendingUp className={sz} /> },
    ],
  },
  {
    label: 'Platform',
    items: [
      { name: 'Audit Log',        href: '/admin/audit-log',        icon: <ClipboardList className={sz} /> },
      { name: 'KYC Settings',     href: '/admin/kyc-settings',     icon: <Settings2 className={sz} /> },
      { name: 'Session Settings', href: '/admin/session-settings', icon: <Timer className={sz} /> },
    ],
  },
]

interface AdminSidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function AdminSidebar({ mobileOpen = false, onMobileClose }: AdminSidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()

  const isActive = (href: string) =>
    href === '/admin'
      ? pathname === '/admin'
      : pathname === href || pathname?.startsWith(href + '/')

  const initials = session?.user?.name
    ?.split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? 'SA'

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map(g => [g.label, true]))
  )

  const toggle = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const sidebarContent = (
    <div className="flex flex-col grow bg-slate-900 pb-4 overflow-y-auto">

      {/* Brand */}
      <div className="flex items-center gap-3 shrink-0 h-14 px-4 border-b border-slate-800">
        <div className="w-8 h-8 bg-indigo-600 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-tight truncate">Platform Admin</p>
          <p className="text-xs text-indigo-400 font-semibold">Super Admin</p>
        </div>
        {/* Close button — mobile only */}
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="md:hidden p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_GROUPS.map(group => {
          const isOpen = openGroups[group.label] ?? false
          const groupActive = group.items.some(i => isActive(i.href))

          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggle(group.label)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors mt-2 ${
                  groupActive ? 'text-slate-300' : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {group.items.map(item => {
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onMobileClose}
                        className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-all ${
                          active
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        <span className="truncate font-medium">{item.name}</span>
                        {item.badge && (
                          <span className="ml-auto text-xs bg-amber-500 text-white rounded-full px-1.5 py-0.5 font-bold leading-none">
                            {item.badge}
                          </span>
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

      {/* User footer */}
      <div className="shrink-0 border-t border-slate-800 p-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-200 truncate">{session?.user?.name ?? 'Super Admin'}</p>
            <p className="text-xs text-indigo-400 font-medium">Platform Admin</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/login' })}
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors shrink-0"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  )

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 z-30 w-60">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-30 w-64 flex flex-col transform transition-transform duration-200 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
