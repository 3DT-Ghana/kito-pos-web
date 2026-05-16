'use client'

import Link from 'next/link'
import { ShoppingCart, Package, TrendingDown, Plus, ArrowRight } from 'lucide-react'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'

interface DashboardProps {
  userName: string
  tenantName: string
}

const quickActions = [
  { label: 'New Sale',     href: '/sales/new',     icon: ShoppingCart },
  { label: 'New Purchase', href: '/purchases/new', icon: TrendingDown  },
  { label: 'Add Item',     href: '/items/new',     icon: Package       },
]

export function ImprovedDashboard({ userName, tenantName }: DashboardProps) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6">

      {/* ── Hero header ────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 px-6 sm:px-10 pt-10 pb-28">
        {/* decorative circles */}
        <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full bg-blue-500/10" />
        <div className="pointer-events-none absolute top-10 -left-16 w-48 h-48 rounded-full bg-indigo-500/10" />
        <div className="pointer-events-none absolute bottom-0 right-1/3 w-64 h-64 rounded-full bg-violet-500/8" />

        <div className="relative max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p className="text-slate-400 text-sm font-medium">{dateStr}</p>
            <h1 className="mt-1 text-3xl font-bold text-white tracking-tight">
              {greeting}, {userName.split(' ')[0]}
            </h1>
            <p className="mt-1 text-slate-400 text-sm">{tenantName}</p>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 shrink-0">
            {quickActions.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white text-sm font-medium backdrop-blur-sm transition-all"
              >
                <Icon className="w-4 h-4" strokeWidth={1.75} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
            <Link
              href="/sales/new"
              className="sm:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500 hover:bg-blue-400 text-white transition-colors"
            >
              <Plus className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Body — pulled up over the hero ─────────────────────────────────── */}
      <div className="relative -mt-20 px-4 sm:px-6 lg:px-8 pb-10 max-w-7xl mx-auto">
        <DashboardCharts />

        {/* Footer link */}
        <div className="mt-6 flex justify-center">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            View full analytics report <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}
