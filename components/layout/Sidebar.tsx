'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useUser } from '@/hooks/useUser'
import { useTenantFeatures } from '@/hooks/useTenant'
import { useSidebar } from '@/lib/sidebar/SidebarContext'
import { useSessionGuard } from '@/lib/session/SessionGuard'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  LayoutDashboard, Monitor, ShoppingCart, FileText, CornerUpLeft,
  Package, ArrowLeftRight, Tag, Factory, CreditCard, Receipt,
  Landmark, Users, Truck, BarChart2, ClipboardList, UserCog,
  GitBranch, Settings, Download, Sliders, Scale, ChevronDown,
  LogOut, Building2, ClipboardCheck, Printer, BookOpen, List, TrendingUp, Briefcase, ShieldCheck,
  Settings2, BarChart3, HelpCircle, Bell,
} from 'lucide-react'

interface NavItem {
  name: string
  href: string
  icon: React.ReactNode
  tooltip: string
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
  const isTrial = user?.tenantStatus === 'TRIAL'
  const TRIAL_LOCKED_GROUPS = new Set(['Finance', 'Accounting', 'Payroll'])

  const ALL = ['OWNER', 'STORE_MANAGER', 'BRANCH_MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'STAFF']
  const has = (...roles: string[]) => roles.includes(role)
  const canSeeApprovals = features.requireApproval && has('OWNER', 'STORE_MANAGER', 'BRANCH_MANAGER', 'ACCOUNTANT')
  const isSuperAdmin = user?.platformRole === 'SUPER_ADMIN'
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)

  const sz = 'w-4 h-4'

  useEffect(() => {
    if (!canSeeApprovals) {
      return
    }

    let cancelled = false

    const loadPendingApprovalCount = async () => {
      try {
        const res = await fetch('/api/approvals?status=PENDING&countOnly=true', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setPendingApprovalCount(0)
          return
        }

        const rawPayload = await res.text()
        const payload = rawPayload ? JSON.parse(rawPayload) : null
        if (!cancelled) {
          setPendingApprovalCount(typeof payload?.total === 'number' ? payload.total : 0)
        }
      } catch {
        if (!cancelled) {
          setPendingApprovalCount(0)
        }
      }
    }

    void loadPendingApprovalCount()
    const interval = window.setInterval(() => {
      void loadPendingApprovalCount()
    }, 10000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [canSeeApprovals])

  const rawGroups = [
    {
      label: 'Main',
      itemsRaw: [
        { name: 'Dashboard',    href: '/dashboard', icon: <LayoutDashboard className={sz} />, tooltip: 'Overview of sales, stock, and activity',                          show: true },
        { name: 'POS Terminal', href: '/pos',        icon: <Monitor className={sz} />,         tooltip: 'Touch-screen point of sale — scan items and process payments',    show: features.enablePosTerminal && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','CASHIER') },
      ],
    },
    {
      label: 'Sales',
      itemsRaw: [
        { name: 'Sales',      href: '/sales',      icon: <ShoppingCart className={sz} />, tooltip: 'View and record all completed sales',                                   show: true },
        { name: 'Quotations', href: '/quotations', icon: <FileText className={sz} />,      tooltip: 'Create price quotes to send to customers before confirming a sale',    show: features.enableQuotations && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','CASHIER') },
        { name: 'Waybills',   href: '/waybills',   icon: <Truck className={sz} />,         tooltip: 'Create and track delivery notes for goods in transit',                  show: has('OWNER','STORE_MANAGER','BRANCH_MANAGER','INVENTORY_MANAGER','CASHIER','STAFF') },
        { name: 'Returns',    href: '/returns',    icon: <CornerUpLeft className={sz} />,  tooltip: 'Process customer returns and refunds',                                  show: has('OWNER','STORE_MANAGER','BRANCH_MANAGER','STAFF') },
      ],
    },
    {
      label: 'Purchasing',
      itemsRaw: [
        { name: 'Purchases',       href: '/purchases',       icon: <Package className={sz} />,        tooltip: 'Record stock received from suppliers',                                              show: true },
        { name: 'Purchase Orders', href: '/purchase-orders', icon: <ClipboardCheck className={sz} />, tooltip: 'Create and track orders sent to suppliers before goods arrive',                    show: features.enablePurchaseOrders && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','INVENTORY_MANAGER') },
      ],
    },
    {
      label: 'Inventory',
      itemsRaw: [
        { name: 'Items',          href: '/items',         icon: <Package className={sz} />,       tooltip: 'Add, edit, and manage all products and services',                                  show: true },
        { name: 'Transfers',      href: '/transfers',     icon: <ArrowLeftRight className={sz} />, tooltip: 'Move stock between branches',                                                      show: features.enableBranches && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','INVENTORY_MANAGER') },
        { name: 'Categories',     href: '/categories',    icon: <Tag className={sz} />,            tooltip: 'Group items into categories for faster POS browsing',                              show: true },
        { name: 'Brands / Mfr.',  href: '/manufacturers', icon: <Factory className={sz} />,        tooltip: 'Manage brands and manufacturers linked to your items',                             show: true },
        { name: 'Barcode Labels', href: '/barcodes',      icon: <Printer className={sz} />,        tooltip: 'Print barcode labels to attach to products',                                       show: features.enableBarcodeGenerator && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','INVENTORY_MANAGER') },
      ],
    },
    {
      label: 'Finance',
      itemsRaw: [
        { name: 'Payments', href: '/payments', icon: <CreditCard className={sz} />, tooltip: 'Record and track customer and supplier payments',                                     show: true },
        { name: 'Expenses',  href: '/expenses', icon: <Receipt className={sz} />,    tooltip: 'Log business running costs such as rent and utilities',                               show: features.enableExpenses && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Till',      href: '/till',     icon: <Landmark className={sz} />,   tooltip: 'Open/close the cash drawer and track cash movements at the register',                show: features.enableTill && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','CASHIER') },
      ],
    },
    {
      label: 'CRM',
      itemsRaw: [
        { name: 'Customers', href: '/customers', icon: <Users className={sz} />, tooltip: 'Manage customer profiles, credit balances, and purchase history', show: true },
        { name: 'Suppliers', href: '/suppliers', icon: <Truck className={sz} />, tooltip: 'Manage supplier details and outstanding balances',                show: true },
      ],
    },
    {
      label: 'Accounting',
      itemsRaw: [
        { name: 'Chart of Accounts', href: '/accounting/chart-of-accounts', icon: <List className={sz} />,          tooltip: 'Set up the accounts used in your financial records',                        show: features.enableAccounting && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Journal',           href: '/accounting/journal',            icon: <BookOpen className={sz} />,      tooltip: 'View and post double-entry journal entries',                               show: features.enableAccounting && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Transfers',         href: '/accounting/transfers',          icon: <ArrowLeftRight className={sz} />, tooltip: 'Move funds between accounts, e.g. cash to bank',                         show: features.enableAccounting && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Financial Reports', href: '/accounting/reports',            icon: <TrendingUp className={sz} />,    tooltip: 'Profit & loss, balance sheet, and other financial summaries',              show: features.enableAccounting && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
      ],
    },
    {
      label: 'Payroll',
      itemsRaw: [
        { name: 'Employees',    href: '/payroll/employees',  icon: <Users className={sz} />,      tooltip: 'Add and manage employee records and salary details',              show: features.enablePayroll && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Payroll Runs', href: '/payroll/runs',       icon: <Briefcase className={sz} />,  tooltip: 'Run monthly payroll to calculate and record staff salaries',      show: features.enablePayroll && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Components',   href: '/payroll/components', icon: <Settings2 className={sz} />,  tooltip: 'Define allowances and deductions applied to employee pay',        show: features.enablePayroll && has('OWNER','STORE_MANAGER') },
        { name: 'Statutory',    href: '/payroll/statutory',  icon: <ShieldCheck className={sz} />, tooltip: 'Configure SSF and PAYE rates required by law',                   show: features.enablePayroll && has('OWNER','STORE_MANAGER') },
        { name: 'Loans',        href: '/payroll/loans',      icon: <Landmark className={sz} />,   tooltip: 'Track employee salary loans and monthly repayments',             show: features.enablePayroll && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
        { name: 'Reports',      href: '/payroll/reports',    icon: <BarChart3 className={sz} />,  tooltip: 'PAYE, SSF, and payment reports for filing and payouts',          show: features.enablePayroll && has('OWNER','STORE_MANAGER','BRANCH_MANAGER','ACCOUNTANT') },
      ],
    },
    {
      label: 'Approvals',
      itemsRaw: [
        { name: 'Approvals', href: '/approvals', icon: <ShieldCheck className={sz} />, tooltip: 'Review and approve flagged transactions that need manager sign-off', show: canSeeApprovals },
      ],
    },
    {
      label: 'Reports',
      itemsRaw: [
        { name: 'Reports',   href: '/reports',    icon: <BarChart2 className={sz} />,     tooltip: 'Sales, inventory, debtor, and tax reports',                     show: true },
        { name: 'Audit Log', href: '/audit-logs', icon: <ClipboardList className={sz} />, tooltip: 'Full history of all changes made in the system',                show: has('OWNER','STORE_MANAGER') },
      ],
    },
    {
      label: 'Admin',
      itemsRaw: [
        { name: 'Users',            href: '/users',                    icon: <UserCog className={sz} />,  tooltip: 'Add team members and assign roles',                          show: has('OWNER','BRANCH_MANAGER') },
        { name: 'Branches',         href: '/branches',                 icon: <GitBranch className={sz} />, tooltip: 'Set up and manage multiple store locations',                show: features.enableBranches && has('OWNER') },
        { name: 'Settings',         href: '/settings',                 icon: <Settings className={sz} />, tooltip: 'Configure taxes, features, receipt, and business details',  show: has('OWNER') },
        { name: 'Import Items',     href: '/import/items',             icon: <Download className={sz} />, tooltip: 'Bulk-upload products from a CSV spreadsheet',               show: ALL.includes(role) },
        { name: 'Import Customers', href: '/import/customers',         icon: <Download className={sz} />, tooltip: 'Bulk-upload customers from a CSV spreadsheet',              show: ALL.includes(role) },
        { name: 'Adjust Stock',     href: '/items/adjust-bulk',        icon: <Sliders className={sz} />,  tooltip: 'Correct stock levels for multiple items at once',           show: ALL.includes(role) },
        { name: 'Adjust Balances',  href: '/customers/adjust-balance', icon: <Scale className={sz} />,    tooltip: 'Manually update a customer\'s outstanding balance',         show: ALL.includes(role) },
      ],
    },
    {
      label: 'Platform',
      itemsRaw: [
        { name: 'Admin Dashboard',       href: '/admin',              icon: <Building2 className={sz} />,     tooltip: 'Platform-wide overview for super admins',             show: isSuperAdmin },
        { name: 'All Companies',         href: '/admin/companies',    icon: <Building2 className={sz} />,     tooltip: 'View and manage all registered businesses',           show: isSuperAdmin },
        { name: 'Business Applications', href: '/admin/applications', icon: <FileText className={sz} />,      tooltip: 'Review new business sign-up applications',            show: isSuperAdmin },
        { name: 'Sales Agents',          href: '/admin/agents',       icon: <UserCog className={sz} />,       tooltip: 'Manage agents who onboard businesses',                show: isSuperAdmin },
        { name: 'Platform Audit Log',    href: '/admin/audit-log',    icon: <ClipboardList className={sz} />, tooltip: 'Full activity log across all tenants',                show: isSuperAdmin },
      ],
    },
  ]

  const groups: (NavGroup & { defaultOpen: boolean })[] = rawGroups
    .map(g => ({
      label: g.label,
      items: g.itemsRaw.filter(i => i.show).map(i => ({ name: i.name, href: i.href, icon: i.icon, tooltip: i.tooltip })),
      defaultOpen: g.itemsRaw.filter(i => i.show).some(
        i => pathname === i.href || pathname?.startsWith(i.href + '/')
      ),
    }))
    .filter(g => g.items.length > 0)

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map(g => [g.label, g.defaultOpen]))
  )

  const tooltipsEnabled =
    typeof window === 'undefined' ? true : localStorage.getItem('petros_tooltips') !== 'off'

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/')

  const getItemTooltipDetail = (item: NavItem) => (
    item.href === '/approvals' && pendingApprovalCount > 0
      ? `${pendingApprovalCount} pending approval${pendingApprovalCount === 1 ? '' : 's'}`
      : item.tooltip
  )

  const renderApprovalBadge = (compact: boolean) => {
    if (pendingApprovalCount <= 0) return null

    if (compact) {
      return (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-[10px] font-bold text-white flex items-center justify-center leading-none shadow-sm">
          {pendingApprovalCount > 99 ? '99+' : pendingApprovalCount}
        </span>
      )
    }

    return (
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
        <Bell className="w-3 h-3" />
        {pendingApprovalCount > 99 ? '99+' : pendingApprovalCount}
      </span>
    )
  }

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
            <Tooltip text="Expand sidebar" enabled={tooltipsEnabled} side="right" wrapperClassName="block">
              <button
                onClick={toggle}
                className="w-9 h-9 bg-blue-600 flex items-center justify-center hover:bg-blue-500 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-white" />
              </button>
            </Tooltip>
          ) : (
            <>
              <div className="w-8 h-8 bg-blue-600 flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight truncate">My Business</p>
                <p className="text-xs text-slate-400">Management</p>
              </div>
              <Tooltip text="Collapse sidebar" enabled={tooltipsEnabled}>
                <button
                  onClick={toggle}
                  className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
                  </svg>
                </button>
              </Tooltip>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {groups.map((group) => {
            const groupActive = group.items.some(i => isActive(i.href))
            const isOpen = openGroups[group.label] ?? group.defaultOpen
            const groupLocked = isTrial && TRIAL_LOCKED_GROUPS.has(group.label)

            if (collapsed) {
              return (
                <div key={group.label} className="space-y-0.5 py-1 border-b border-slate-800 last:border-0">
                  {group.items.map(item => {
                    const active = isActive(item.href)
                    const locked = groupLocked
                    const tooltipText = locked
                      ? `${item.name} — Upgrade from Trial to access`
                      : `${item.name} — ${getItemTooltipDetail(item)}`
                    return (
                      <Tooltip
                        key={item.href}
                        text={tooltipText}
                        enabled={tooltipsEnabled}
                        side="right"
                        wrapperClassName="block"
                        offset={14}
                      >
                        {locked ? (
                          <div className="relative flex items-center justify-center w-9 h-9 mx-auto text-slate-600 cursor-not-allowed">
                            {item.icon}
                            <span className="absolute -top-1 -right-1 bg-amber-500 text-[8px] font-bold text-white px-0.5 leading-tight">T</span>
                          </div>
                        ) : (
                          <Link
                            href={item.href}
                            className={`relative flex items-center justify-center w-9 h-9 mx-auto transition-all ${
                              active
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                          >
                            {item.icon}
                            {isTrial && (
                              <span className="absolute -top-1 -right-1 bg-amber-500 text-[8px] font-bold text-white px-0.5 leading-tight">T</span>
                            )}
                            {item.href === '/approvals' && renderApprovalBadge(true)}
                          </Link>
                        )}
                      </Tooltip>
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
                  {isTrial && (
                    <span className="mr-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white leading-tight">
                      Trial
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isOpen && (
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map(item => {
                      const active = isActive(item.href)
                      const locked = groupLocked
                      return (
                        <Tooltip
                          key={item.href}
                          text={locked ? 'Upgrade from Trial to access this feature' : getItemTooltipDetail(item)}
                          enabled={tooltipsEnabled}
                          wrapperClassName="block"
                        >
                          {locked ? (
                            <div className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm cursor-not-allowed text-slate-600 select-none`}>
                              <span className="shrink-0 opacity-50">{item.icon}</span>
                              <span className="truncate font-medium opacity-50">{item.name}</span>
                              <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white leading-tight shrink-0">
                                Trial
                              </span>
                            </div>
                          ) : (
                            <Link
                              href={item.href}
                              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-all ${
                                active
                                  ? 'bg-blue-600 text-white'
                                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                              }`}
                            >
                              <span className="shrink-0">{item.icon}</span>
                              <span className="truncate font-medium">{item.name}</span>
                              {isTrial && (
                                <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white leading-tight shrink-0">
                                  Trial
                                </span>
                              )}
                              {item.href === '/approvals' && renderApprovalBadge(false)}
                            </Link>
                          )}
                        </Tooltip>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Bottom bar */}
        <div className={`shrink-0 border-t border-slate-800 ${collapsed ? 'p-2 space-y-1' : 'p-3'}`}>
          {collapsed ? (
            <>
              <Tooltip text="Help & Support" enabled={tooltipsEnabled} side="right" wrapperClassName="block">
                <Link
                  href="/help"
                  className={`w-9 h-9 flex items-center justify-center mx-auto transition-colors ${
                    isActive('/help') ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <HelpCircle className="w-4 h-4" />
                </Link>
              </Tooltip>
              <Tooltip text="Sign out" enabled={tooltipsEnabled} side="right" wrapperClassName="block">
                <button
                  onClick={openSignOut}
                  className="w-9 h-9 flex items-center justify-center mx-auto text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </Tooltip>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <Link
                  href="/help"
                  className={`flex items-center gap-2 px-2 py-1.5 text-sm transition-colors ${
                    isActive('/help')
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <HelpCircle className="w-4 h-4 shrink-0" />
                  <span className="font-medium">Help &amp; Support</span>
                </Link>
                <Tooltip text="Sign out" enabled={tooltipsEnabled}>
                  <button
                    onClick={openSignOut}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors shrink-0"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </Tooltip>
              </div>
              <p className="text-[10px] text-slate-600 text-center leading-tight">
                System Developed EYO Solutions | 0246462398
              </p>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
