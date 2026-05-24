'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useUser } from '@/hooks/useUser'
import { useTenantFeatures } from '@/hooks/useTenant'
import { useSidebar } from '@/lib/sidebar/SidebarContext'
import { useSessionGuard } from '@/lib/session/SessionGuard'
import {
  LayoutDashboard, Monitor, ShoppingCart, FileText, CornerUpLeft,
  Package, ArrowLeftRight, Tag, Factory, CreditCard, Receipt,
  Landmark, Users, Truck, BarChart2, ClipboardList, UserCog,
  GitBranch, Settings, Download, Sliders, Scale, ChevronDown,
  LogOut, Building2, ClipboardCheck, Printer, BookOpen, List, TrendingUp, Briefcase, ShieldCheck,
  Settings2, BarChart3,
} from 'lucide-react'

interface NavItem {
  name: string
  href: string
  icon: React.ReactNode
}

interface NavGroup {
  label: string
  items: NavItem[]
}

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useUser()
  const { features } = useTenantFeatures()
  const { collapsed, toggle } = useSidebar()
  const { openSignOut } = useSessionGuard()
  const role = user?.role || ''

  const ALL = ['OWNER', 'STORE_MANAGER', 'BRANCH_MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'STAFF']
  const has = (...roles: string[]) => roles.includes(role)
  const superAdminEmails = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const isSuperAdmin = !!user?.email && superAdminEmails.includes(user.email.toLowerCase())

  const sz = 'w-4 h-4'

  const rawGroups = [
    {
      label: 'Main',
      itemsRaw: [
        { name: 'Dashboard',    href: '/dashboard', icon: <LayoutDashboard className={sz} />, show: true },
        { name: 'POS Terminal', href: '/pos',        icon: <Monitor className={sz} />,         show: features.enablePosTerminal && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','CASHIER') },
      ],
    },
    {
      label: 'Sales',
      itemsRaw: [
        { name: 'Sales',       href: '/sales',       icon: <ShoppingCart className={sz} />,  show: true },
        { name: 'Quotations',  href: '/quotations',  icon: <FileText className={sz} />,       show: features.enableQuotations && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','CASHIER') },
        { name: 'Returns',     href: '/returns',     icon: <CornerUpLeft className={sz} />,   show: has('OWNER','STORE_MANAGER','BRANCH_MANAGER','STAFF') },
      ],
    },
    {
      label: 'Purchasing',
      itemsRaw: [
        { name: 'Purchases',       href: '/purchases',       icon: <Package className={sz} />,       show: true },
        { name: 'Purchase Orders', href: '/purchase-orders', icon: <ClipboardCheck className={sz} />, show: features.enablePurchaseOrders && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','INVENTORY_MANAGER') },
      ],
    },
    {
      label: 'Inventory',
      itemsRaw: [
        { name: 'Items',         href: '/items',         icon: <Package className={sz} />,        show: true },
        { name: 'Transfers',     href: '/transfers',     icon: <ArrowLeftRight className={sz} />,  show: features.enableBranches && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','INVENTORY_MANAGER') },
        { name: 'Categories',    href: '/categories',    icon: <Tag className={sz} />,             show: true },
        { name: 'Manufacturers', href: '/manufacturers', icon: <Factory className={sz} />,         show: true },
        { name: 'Barcode Labels', href: '/barcodes',     icon: <Printer className={sz} />,         show: features.enableBarcodeGenerator && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','INVENTORY_MANAGER') },
      ],
    },
    {
      label: 'Finance',
      itemsRaw: [
        { name: 'Payments', href: '/payments', icon: <CreditCard className={sz} />, show: true },
        { name: 'Expenses', href: '/expenses', icon: <Receipt className={sz} />,    show: features.enableExpenses && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Till',     href: '/till',     icon: <Landmark className={sz} />,   show: features.enableTill && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','CASHIER') },
      ],
    },
    {
      label: 'CRM',
      itemsRaw: [
        { name: 'Customers', href: '/customers', icon: <Users className={sz} />,  show: true },
        { name: 'Suppliers', href: '/suppliers', icon: <Truck className={sz} />,   show: true },
      ],
    },
    {
      label: 'Accounting',
      itemsRaw: [
        { name: 'Chart of Accounts', href: '/accounting/chart-of-accounts', icon: <List className={sz} />,     show: features.enableAccounting && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Journal',           href: '/accounting/journal',            icon: <BookOpen className={sz} />, show: features.enableAccounting && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Transfers',         href: '/accounting/transfers',          icon: <ArrowLeftRight className={sz} />, show: features.enableAccounting && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Financial Reports', href: '/accounting/reports',            icon: <TrendingUp className={sz} />, show: features.enableAccounting && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
      ],
    },
    {
      label: 'Payroll',
      itemsRaw: [
        { name: 'Employees',     href: '/payroll/employees',  icon: <Users className={sz} />,     show: features.enablePayroll && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Payroll Runs',  href: '/payroll/runs',       icon: <Briefcase className={sz} />,  show: features.enablePayroll && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Components',    href: '/payroll/components', icon: <Settings2 className={sz} />,  show: features.enablePayroll && has('OWNER','STORE_MANAGER') },
        { name: 'Statutory',     href: '/payroll/statutory',  icon: <ShieldCheck className={sz} />, show: features.enablePayroll && has('OWNER','STORE_MANAGER') },
        { name: 'Loans',         href: '/payroll/loans',      icon: <Landmark className={sz} />,   show: features.enablePayroll && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Reports',       href: '/payroll/reports',    icon: <BarChart3 className={sz} />,  show: features.enablePayroll && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
      ],
    },
    {
      label: 'Approvals',
      itemsRaw: [
        { name: 'Approvals', href: '/approvals', icon: <ShieldCheck className={sz} />, show: features.requireApproval && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
      ],
    },
    {
      label: 'Reports',
      itemsRaw: [
        { name: 'Reports',   href: '/reports',    icon: <BarChart2 className={sz} />,     show: true },
        { name: 'Audit Log', href: '/audit-logs', icon: <ClipboardList className={sz} />, show: has('OWNER','STORE_MANAGER') },
      ],
    },
    {
      label: 'Admin',
      itemsRaw: [
        { name: 'Users',             href: '/users',                    icon: <UserCog className={sz} />,     show: has('OWNER','BRANCH_MANAGER') },
        { name: 'Branches',          href: '/branches',                 icon: <GitBranch className={sz} />,   show: features.enableBranches && has('OWNER') },
        { name: 'Settings',          href: '/settings',                 icon: <Settings className={sz} />,    show: has('OWNER') },
        { name: 'Import Items',      href: '/import/items',             icon: <Download className={sz} />,    show: ALL.includes(role) },
        { name: 'Import Customers',  href: '/import/customers',         icon: <Download className={sz} />,    show: ALL.includes(role) },
        { name: 'Adjust Stock',      href: '/items/adjust-bulk',        icon: <Sliders className={sz} />,     show: ALL.includes(role) },
        { name: 'Adjust Balances',   href: '/customers/adjust-balance', icon: <Scale className={sz} />,       show: ALL.includes(role) },
      ],
    },
    {
      label: 'Platform',
      itemsRaw: [
        { name: 'Admin Dashboard',       href: '/admin',               icon: <Building2 className={sz} />,    show: isSuperAdmin },
        { name: 'All Companies',         href: '/admin/companies',     icon: <Building2 className={sz} />,    show: isSuperAdmin },
        { name: 'Business Applications', href: '/admin/applications',  icon: <FileText className={sz} />,     show: isSuperAdmin },
        { name: 'Sales Agents',          href: '/admin/agents',        icon: <UserCog className={sz} />,      show: isSuperAdmin },
        { name: 'Platform Audit Log',    href: '/admin/audit-log',     icon: <ClipboardList className={sz} />, show: isSuperAdmin },
      ],
    },
  ]

  const groups: (NavGroup & { defaultOpen: boolean })[] = rawGroups
    .map(g => ({
      label: g.label,
      items: g.itemsRaw.filter(i => i.show).map(i => ({ name: i.name, href: i.href, icon: i.icon })),
      defaultOpen: g.itemsRaw.filter(i => i.show).some(
        i => pathname === i.href || pathname?.startsWith(i.href + '/')
      ),
    }))
    .filter(g => g.items.length > 0)

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map(g => [g.label, g.defaultOpen]))
  )

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/')

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const roleLabel = user?.role?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? ''

  return (
    <aside
      className={`hidden md:flex flex-col fixed inset-y-0 z-30 transition-all duration-200 ease-in-out ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="flex flex-col grow bg-slate-900 pb-4 overflow-y-auto overflow-x-hidden">

        {/* Brand */}
        <div className={`flex items-center shrink-0 h-14 border-b border-slate-800 ${collapsed ? 'justify-center' : 'px-4 gap-3'}`}>
          {collapsed ? (
            <button
              onClick={toggle}
              title="Expand sidebar"
              className="w-9 h-9 bg-blue-600 flex items-center justify-center hover:bg-blue-500 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-white" />
            </button>
          ) : (
            <>
              <div className="w-8 h-8 bg-blue-600 flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight truncate">My Business</p>
                <p className="text-xs text-slate-400">Management</p>
              </div>
              <button
                onClick={toggle}
                title="Collapse sidebar"
                className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {groups.map((group) => {
            const groupActive = group.items.some(i => isActive(i.href))
            const isOpen = openGroups[group.label] ?? group.defaultOpen

            if (collapsed) {
              return (
                <div key={group.label} className="space-y-0.5 py-1 border-b border-slate-800 last:border-0">
                  {group.items.map(item => {
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={`${group.label}: ${item.name}`}
                        className={`flex items-center justify-center w-9 h-9 mx-auto transition-all ${
                          active
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {item.icon}
                      </Link>
                    )
                  })}
                </div>
              )
            }

            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
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
                          className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-all ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                          }`}
                        >
                          <span className="shrink-0">{item.icon}</span>
                          <span className="truncate font-medium">{item.name}</span>
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
        <div className={`shrink-0 border-t border-slate-800 ${collapsed ? 'p-2' : 'p-3'}`}>
          {collapsed ? (
            <div
              title={`${user?.name} · ${roleLabel}`}
              className="w-9 h-9 bg-slate-700 flex items-center justify-center text-slate-200 font-bold text-xs mx-auto"
            >
              {initials}
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-slate-700 flex items-center justify-center text-slate-200 font-bold text-xs shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-200 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{roleLabel}</p>
              </div>
              <button
                onClick={openSignOut}
                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors shrink-0"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
