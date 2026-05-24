'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import Link from 'next/link'
import { Building2, ChevronRight, FilePlus } from 'lucide-react'

interface Plan {
  id: string
  tenantId: string
  name: string | null
  billingCycle: string
  discount: number
  createdAt: string
  tenant: { id: string; name: string; status: string } | null
  features: { feature: { id: string; name: string } }[]
  items: { item: { id: string; name: string } }[]
  _count: { invoices: number }
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  TRIAL: 'bg-amber-100 text-amber-700',
  SUSPENDED: 'bg-red-100 text-red-700',
}

export default function TenantPlansListPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/tenant-plans').then((r) => r.json()).then((data) => {
      setPlans(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tenant Business Plans</h1>
            <p className="text-sm text-gray-500 mt-0.5">Assign feature modules and hardware to each tenant and generate invoices.</p>
          </div>
          <Link
            href="/admin/companies"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <FilePlus className="w-4 h-4" /> Setup via Companies
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-white border border-gray-200 p-12 text-center">
            <Building2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No tenant plans configured yet.</p>
            <p className="text-xs text-gray-400 mt-1">Open a company from the Companies page and set up their plan.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {plans.map((plan) => (
              <Link
                key={plan.id}
                href={`/admin/tenant-plans/${plan.tenantId}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{plan.tenant?.name ?? plan.tenantId}</p>
                    {plan.tenant && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[plan.tenant.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {plan.tenant.status}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 mt-0.5">
                    <span>{plan.features.length} feature{plan.features.length !== 1 ? 's' : ''}</span>
                    <span>{plan.items.length} item{plan.items.length !== 1 ? 's' : ''}</span>
                    <span>{plan._count.invoices} invoice{plan._count.invoices !== 1 ? 's' : ''}</span>
                    {plan.discount > 0 && <span className="text-emerald-600">{plan.discount}% discount</span>}
                  </div>
                </div>
                <span className="text-xs text-gray-400 capitalize shrink-0">{plan.billingCycle.toLowerCase().replace('_', '-')}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
