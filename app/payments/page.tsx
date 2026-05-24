'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { useBranch } from '@/lib/branch/BranchContext'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { EmptyState } from '@/components/ui/EmptyState'
import { CreditCard, Search, X, Users, Truck, TrendingUp } from 'lucide-react'

interface Payment {
  id: string
  amount: number
  method: string
  createdAt: Date
  customer?: { id: string; name: string }
  supplier?: { id: string; name: string }
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-indigo-500', 'bg-teal-500',
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function PaymentsPage() {
  const router = useRouter()
  const { currentBranchId } = useBranch()
  const [payments, setPayments] = useState<Payment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchPayments() }, [currentBranchId])

  const fetchPayments = async () => {
    try {
      setIsLoading(true)
      const [customerRes, supplierRes] = await Promise.all([
        fetch('/api/payments/customers'),
        fetch('/api/payments/suppliers'),
      ])
      if (!customerRes.ok || !supplierRes.ok) throw new Error('Failed to fetch payments')
      const customerData = await customerRes.json()
      const supplierData = await supplierRes.json()
      const allPayments = [
        ...(customerData.payments || customerData.data || []),
        ...(supplierData.payments || supplierData.data || []),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setPayments(allPayments)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payments')
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = payments.filter(p => {
    const q = search.toLowerCase()
    const name = p.customer?.name || p.supplier?.name || ''
    return !q || name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
  })

  const totalAmount = filtered.reduce((s, p) => s + p.amount, 0)
  const customerPayments = payments.filter(p => p.customer)
  const supplierPayments = payments.filter(p => p.supplier)

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Payment History"
          subtitle="All customer and supplier payments"
          actions={
            <>
              <Btn variant="secondary" icon={Users} onClick={() => router.push('/payments/customers')}>
                Customer Payment
              </Btn>
              <Btn icon={Truck} onClick={() => router.push('/payments/suppliers')}>
                Supplier Payment
              </Btn>
            </>
          }
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard
            label="Total Payments"
            value={payments.length}
            icon={CreditCard}
            accent="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatCard
            label="Total Amount"
            value={formatCurrency(totalAmount)}
            icon={TrendingUp}
            accent="bg-emerald-50"
            iconColor="text-emerald-600"
            valueColor="text-emerald-700"
          />
          <StatCard
            label="Breakdown"
            value={`${customerPayments.length} / ${supplierPayments.length}`}
            sub="Customer / Supplier"
            icon={Users}
            accent="bg-violet-50"
            iconColor="text-violet-600"
            className="col-span-2 lg:col-span-1"
          />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 bg-white border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="bg-white shadow-sm ring-1 ring-black/5 h-14 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments found"
            description={search ? 'Try a different search term' : 'No payment records yet'}
          />
        ) : (
          <div className="bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Party</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(payment => {
                  const name = payment.customer?.name || payment.supplier?.name || 'Unknown'
                  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  const isCustomer = !!payment.customer
                  return (
                    <tr key={payment.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-5 py-3.5 text-sm text-gray-600">{formatDate(payment.createdAt)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 ${avatarColor(name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{name}</p>
                            <p className="text-xs text-gray-400 font-mono">#{payment.id.slice(0,8).toUpperCase()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <Badge variant={isCustomer ? 'blue' : 'violet'}>
                          {isCustomer ? 'Customer' : 'Supplier'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <Badge variant="gray">{payment.method}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-emerald-600 text-sm">
                        {formatCurrency(payment.amount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-5 py-3 bg-gray-50/60 border-t border-gray-100 text-xs text-gray-400 font-medium">
              {filtered.length} of {payments.length} payments
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
