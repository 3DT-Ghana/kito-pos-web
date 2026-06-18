'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { TabBar } from '@/components/ui/TabBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import {
  Users, Search, X, AlertCircle, CheckCircle, Plus,
  Scale, Download, Phone, MessageCircle
} from 'lucide-react'

type Tab = 'all' | 'debtors' | 'paid'

interface Customer {
  id: string
  name: string
  phone: string | null
  balance: number
  _count?: { sales: number }
}


export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(1)
  const [sendingReminder, setSendingReminder] = useState<string | null>(null)
  const PAGE_SIZE = 20

  useEffect(() => { fetchCustomers() }, [])

  async function sendWhatsAppReminder(e: React.MouseEvent, customer: Customer) {
    e.stopPropagation()
    if (!customer.phone) { alert('This customer has no phone number.'); return }
    if (customer.balance <= 0) { alert('This customer has no outstanding balance.'); return }
    setSendingReminder(customer.id)
    try {
      const res = await fetch(`/api/customers/${customer.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'whatsapp' }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to send reminder'); return }
      alert(`WhatsApp reminder sent to ${customer.name}`)
    } catch {
      alert('Failed to send reminder')
    } finally {
      setSendingReminder(null)
    }
  }

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setCustomers(data.customers || data.data || data || [])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => setPage(1), [search, tab])

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
    const matchTab = tab === 'all' ? true : tab === 'debtors' ? c.balance > 0 : c.balance === 0
    return matchSearch && matchTab
  })

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalDebt = customers.reduce((s, c) => s + Math.max(0, c.balance), 0)
  const debtors = customers.filter(c => c.balance > 0)
  const cleared = customers.length - debtors.length

  const tabs = [
    { value: 'all' as Tab, label: 'All', count: customers.length },
    { value: 'debtors' as Tab, label: 'With Debt', count: debtors.length, countVariant: 'red' as const },
    { value: 'paid' as Tab, label: 'Cleared', count: cleared, countVariant: 'green' as const },
  ]

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Customers"
          subtitle={`${customers.length} customers registered`}
          actions={
            <>
              <ExportButton
                filename="customers"
                getData={() => filtered.map(c => ({
                  Name: c.name,
                  Phone: c.phone || '',
                  'Balance Owed (GHS)': c.balance.toFixed(2),
                  'Total Sales': c._count?.sales ?? '',
                }))}
              />
              <Btn variant="secondary" icon={Scale} onClick={() => router.push('/customers/adjust-balance')} size="sm">
                Adjust Balances
              </Btn>
              <Btn variant="secondary" icon={Download} onClick={() => router.push('/import/customers')} size="sm">
                Import
              </Btn>
              <Btn icon={Plus} href="/customers/new">Add Customer</Btn>
            </>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard
            label="Total Customers"
            value={customers.length}
            icon={Users}
            accent="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatCard
            label="Total Owed to You"
            value={formatCurrency(totalDebt)}
            sub={`${debtors.length} customers with debt`}
            icon={AlertCircle}
            accent="bg-red-50"
            iconColor="text-red-500"
            valueColor="text-red-600"
          />
          <StatCard
            label="Cleared Accounts"
            value={cleared}
            sub="No outstanding balance"
            icon={CheckCircle}
            accent="bg-emerald-50"
            iconColor="text-emerald-600"
            valueColor="text-emerald-700"
            className="col-span-2 lg:col-span-1"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <TabBar tabs={tabs} active={tab} onChange={setTab} />
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
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
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white shadow-sm ring-1 ring-black/5 h-16 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No customers found"
            description={search ? 'Try a different name or phone number' : tab !== 'all' ? 'No customers in this category' : 'Add your first customer to get started'}
            action={!search && tab === 'all' && (
              <Btn icon={Plus} href="/customers/new" size="sm">Add First Customer</Btn>
            )}
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {paginated.map(c => {
                return (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/customers/${c.id}`)}
                    className="bg-white shadow-sm ring-1 ring-black/5 p-4 flex items-center gap-3 cursor-pointer active:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
                      {c.phone && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />{c.phone}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{c._count?.sales || 0} sales</p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      {c.balance > 0 ? (
                        <>
                          <p className="text-sm font-bold text-red-600">{formatCurrency(c.balance)}</p>
                          <p className="text-xs text-red-400">owes you</p>
                          {c.phone && (
                            <button
                              onClick={e => sendWhatsAppReminder(e, c)}
                              disabled={sendingReminder === c.id}
                              className="flex items-center gap-1 text-xs text-emerald-600 font-semibold hover:text-emerald-700 disabled:opacity-40"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              {sendingReminder === c.id ? 'Sending…' : 'Remind'}
                            </button>
                          )}
                        </>
                      ) : (
                        <Badge variant="green">Cleared</Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />

            {/* Desktop Table */}
            <div className="hidden md:block bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Sales</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance Owed</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map(c => {
                    return (
                      <tr key={c.id} className="hover:bg-blue-50/40 transition-colors cursor-pointer" onClick={() => router.push(`/customers/${c.id}`)}>
                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-gray-900 text-sm">{c.name}</span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{c.phone || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-center text-gray-600">{c._count?.sales || 0}</td>
                        <td className="px-5 py-3.5 text-right">
                          {c.balance > 0
                            ? <span className="font-bold text-red-600 text-sm">{formatCurrency(c.balance)}</span>
                            : <span className="text-gray-300 text-sm">—</span>
                          }
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <Badge variant={c.balance > 0 ? 'red' : 'green'} dot>
                            {c.balance > 0 ? 'Has Debt' : 'Cleared'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button className="text-xs text-blue-600 font-semibold hover:underline">
                              View →
                            </button>
                            {c.balance > 0 && c.phone && (
                              <button
                                onClick={e => sendWhatsAppReminder(e, c)}
                                disabled={sendingReminder === c.id}
                                title="Send WhatsApp balance reminder"
                                className="p-1 text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                              >
                                {sendingReminder === c.id
                                  ? <span className="text-xs">…</span>
                                  : <MessageCircle className="w-4 h-4" />
                                }
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">{filtered.length} of {customers.length} results</span>
                <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
