'use client'

import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  ClipboardList, TrendingUp, ShoppingBag, Package,
  AlertCircle, Truck, ArrowRight, BadgePercent
} from 'lucide-react'

const REPORTS = [
  {
    title: 'End of Day Report',
    description: 'Complete daily summary of sales, payments, purchases, and inventory',
    icon: ClipboardList,
    href: '/reports/end-of-day',
    accent: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    border: 'border-indigo-100',
  },
  {
    title: 'Sales Reports',
    description: 'View sales performance, trends, and statistics',
    icon: TrendingUp,
    href: '/reports/sales',
    accent: 'bg-blue-50',
    iconColor: 'text-blue-600',
    border: 'border-blue-100',
  },
  {
    title: 'Purchase Reports',
    description: 'Track purchase history and supplier analytics',
    icon: ShoppingBag,
    href: '/reports/purchases',
    accent: 'bg-violet-50',
    iconColor: 'text-violet-600',
    border: 'border-violet-100',
  },
  {
    title: 'Inventory Reports',
    description: 'Stock levels, low stock alerts, and inventory value',
    icon: Package,
    href: '/reports/inventory',
    accent: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    border: 'border-emerald-100',
  },
  {
    title: 'Debtors Report',
    description: 'Customers with outstanding balances',
    icon: AlertCircle,
    href: '/reports/debtors',
    accent: 'bg-red-50',
    iconColor: 'text-red-500',
    border: 'border-red-100',
  },
  {
    title: 'Creditors Report',
    description: 'Suppliers you owe money to',
    icon: Truck,
    href: '/reports/creditors',
    accent: 'bg-amber-50',
    iconColor: 'text-amber-600',
    border: 'border-amber-100',
  },
  {
    title: 'Tax Reports',
    description: 'Tax summary, tax by invoice, product, and liability tracking',
    icon: BadgePercent,
    href: '/reports/tax',
    accent: 'bg-cyan-50',
    iconColor: 'text-cyan-700',
    border: 'border-cyan-100',
  },
]

export default function ReportsPage() {
  const router = useRouter()

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Reports"
          subtitle="Access business insights and analytics"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORTS.map((report) => {
            const Icon = report.icon
            return (
              <button
                key={report.href}
                onClick={() => router.push(report.href)}
                className={`group bg-white shadow-sm ring-1 ring-black/5 p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer`}
              >
                <div className={`w-11 h-11 ${report.accent} flex items-center justify-center mb-4`}>
                  <Icon className={`w-5 h-5 ${report.iconColor}`} strokeWidth={1.75} />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-1">{report.title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{report.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </AppLayout>
  )
}
