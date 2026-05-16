'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { TabBar } from '@/components/ui/TabBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'
import {
  FileText, Search, X, CheckCircle, XCircle,
  Clock, Send, Plus, ChevronRight,
} from 'lucide-react'

type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'
type StatusFilter = QuotationStatus | 'all'

interface Quotation {
  id: string
  customerId: string | null
  customer: { id: string; name: string; phone: string | null } | null
  status: QuotationStatus
  totalAmount: number
  note: string | null
  validUntil: string | null
  createdAt: string
  items: { id: string; itemName: string; quantity: number; price: number }[]
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-pink-500',
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

const STATUS_BADGE: Record<QuotationStatus, { variant: 'slate' | 'blue' | 'green' | 'red' | 'amber'; label: string }> = {
  DRAFT:    { variant: 'slate',  label: 'Draft'    },
  SENT:     { variant: 'blue',   label: 'Sent'     },
  ACCEPTED: { variant: 'green',  label: 'Accepted' },
  REJECTED: { variant: 'red',    label: 'Rejected' },
  EXPIRED:  { variant: 'amber',  label: 'Expired'  },
}

const STATUS_ICONS: Record<QuotationStatus, React.ElementType> = {
  DRAFT:    FileText,
  SENT:     Send,
  ACCEPTED: CheckCircle,
  REJECTED: XCircle,
  EXPIRED:  Clock,
}

const STATUS_ACCENT: Record<QuotationStatus, { bg: string; icon: string; text: string; border: string }> = {
  DRAFT:    { bg: 'bg-gray-50',   icon: 'text-gray-500',   text: 'text-gray-900',  border: 'border-gray-200' },
  SENT:     { bg: 'bg-blue-50',   icon: 'text-blue-500',   text: 'text-blue-900',  border: 'border-blue-200' },
  ACCEPTED: { bg: 'bg-emerald-50',icon: 'text-emerald-500',text: 'text-emerald-900',border: 'border-emerald-200' },
  REJECTED: { bg: 'bg-red-50',    icon: 'text-red-500',    text: 'text-red-900',   border: 'border-red-200' },
  EXPIRED:  { bg: 'bg-amber-50',  icon: 'text-amber-500',  text: 'text-amber-900', border: 'border-amber-200' },
}

export default function QuotationsPage() {
  const router = useRouter()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  useEffect(() => { fetchQuotations() }, [])

  const fetchQuotations = async () => {
    try {
      const res = await fetch('/api/quotations')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setQuotations(data.quotations || [])
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = quotations.filter(q => {
    const qStr = search.toLowerCase()
    const matchSearch = !qStr
      || (q.customer?.name || '').toLowerCase().includes(qStr)
      || q.id.toLowerCase().includes(qStr)
      || q.items.some(i => i.itemName.toLowerCase().includes(qStr))
    const matchStatus = statusFilter === 'all' || q.status === statusFilter
    return matchSearch && matchStatus
  })

  const statusCounts = quotations.reduce((acc, q) => {
    acc[q.status] = (acc[q.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalValue = filtered.reduce((s, q) => s + q.totalAmount, 0)
  const acceptedValue = quotations
    .filter(q => q.status === 'ACCEPTED')
    .reduce((s, q) => s + q.totalAmount, 0)

  const statusTabs = [
    { value: 'all' as StatusFilter, label: 'All', count: quotations.length },
    { value: 'DRAFT' as StatusFilter, label: 'Draft', count: statusCounts['DRAFT'] || 0 },
    { value: 'SENT' as StatusFilter, label: 'Sent', count: statusCounts['SENT'] || 0, countVariant: 'blue' as const },
    { value: 'ACCEPTED' as StatusFilter, label: 'Accepted', count: statusCounts['ACCEPTED'] || 0, countVariant: 'green' as const },
    { value: 'REJECTED' as StatusFilter, label: 'Rejected', count: statusCounts['REJECTED'] || 0, countVariant: 'red' as const },
  ]

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Quotations"
          subtitle={`${quotations.length} proforma invoice${quotations.length !== 1 ? 's' : ''}`}
          actions={
            <>
              <ExportButton
                filename="quotations"
                getData={() => filtered.map(q => ({
                  Date: formatDate(q.createdAt),
                  Customer: q.customer?.name || 'Walk-in',
                  Status: q.status,
                  Items: q.items.length,
                  'Total (GHS)': q.totalAmount.toFixed(2),
                  'Valid Until': q.validUntil ? formatDate(q.validUntil) : '',
                }))}
              />
              <Btn icon={Plus} href="/quotations/new">New Quote</Btn>
            </>
          }
        />

        {/* Status summary cards — clickable filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as QuotationStatus[]).map(status => {
            const accent = STATUS_ACCENT[status]
            const Icon = STATUS_ICONS[status]
            const isActive = statusFilter === status
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(isActive ? 'all' : status)}
                className={`rounded-2xl p-4 border text-left transition-all shadow-sm ring-1 ${
                  isActive ? 'ring-blue-400 ring-2' : 'ring-black/5'
                } ${accent.bg} ${accent.border}`}
              >
                <div className={`w-8 h-8 rounded-xl ${accent.bg} border ${accent.border} flex items-center justify-center mb-2`}>
                  <Icon className={`w-4 h-4 ${accent.icon}`} strokeWidth={1.75} />
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{status}</p>
                <p className={`text-2xl font-bold mt-0.5 ${accent.text}`}>{statusCounts[status] || 0}</p>
              </button>
            )
          })}
        </div>

        {/* Summary stat */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Filtered Value"
            value={formatCurrency(totalValue)}
            sub={`${filtered.length} quotation${filtered.length !== 1 ? 's' : ''} shown`}
            icon={FileText}
            accent="bg-blue-50"
            iconColor="text-blue-600"
            valueColor="text-blue-700"
          />
          <StatCard
            label="Accepted Value"
            value={formatCurrency(acceptedValue)}
            sub={`${statusCounts['ACCEPTED'] || 0} accepted quote${(statusCounts['ACCEPTED'] || 0) !== 1 ? 's' : ''}`}
            icon={CheckCircle}
            accent="bg-emerald-50"
            iconColor="text-emerald-600"
            valueColor="text-emerald-700"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <TabBar tabs={statusTabs} active={statusFilter} onChange={setStatusFilter} />
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search customer, item, or ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 h-20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No quotations found"
            description={
              search
                ? 'Try a different customer name, item, or ID'
                : statusFilter !== 'all'
                  ? `No ${statusFilter.toLowerCase()} quotations yet`
                  : 'Create your first quotation to get started'
            }
            action={!search && statusFilter === 'all' && (
              <Btn icon={Plus} href="/quotations/new" size="sm">Create First Quote</Btn>
            )}
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filtered.map(q => {
                const { variant, label } = STATUS_BADGE[q.status]
                const name = q.customer?.name || 'Walk-in'
                const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                const isExpiredNow = q.validUntil && new Date(q.validUntil) < new Date() && q.status === 'SENT'
                return (
                  <div
                    key={q.id}
                    onClick={() => router.push(`/quotations/${q.id}`)}
                    className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-4 cursor-pointer active:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl ${avatarColor(name)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm truncate">{name}</p>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">#{q.id.slice(0, 8).toUpperCase()}</p>
                          </div>
                          <p className="font-bold text-gray-900 shrink-0">{formatCurrency(q.totalAmount)}</p>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-400">
                            {formatDate(q.createdAt)} · {q.items.length} item{q.items.length !== 1 ? 's' : ''}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={variant} dot>{label}</Badge>
                            {isExpiredNow && <Badge variant="amber">Overdue</Badge>}
                          </div>
                        </div>
                        {q.validUntil && (
                          <p className={`mt-1 text-xs ${isExpiredNow ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                            Valid until {formatDate(q.validUntil)}
                            {isExpiredNow && ' — expired'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Valid Until</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(q => {
                    const { variant, label } = STATUS_BADGE[q.status]
                    const name = q.customer?.name || 'Walk-in'
                    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    const isExpiredNow = q.validUntil && new Date(q.validUntil) < new Date() && q.status === 'SENT'
                    return (
                      <tr
                        key={q.id}
                        onClick={() => router.push(`/quotations/${q.id}`)}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg ${avatarColor(name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                              {initials}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{name}</p>
                              <p className="text-xs text-gray-400 font-mono">#{q.id.slice(0, 8).toUpperCase()}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600">{formatDate(q.createdAt)}</td>
                        <td className="px-5 py-3.5 text-sm text-center text-gray-600">{q.items.length}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-gray-900">{formatCurrency(q.totalAmount)}</td>
                        <td className="px-5 py-3.5 text-sm">
                          {q.validUntil ? (
                            <span className={isExpiredNow ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                              {formatDate(q.validUntil)}
                              {isExpiredNow && (
                                <span className="ml-1 text-xs text-red-400">(overdue)</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <Badge variant={variant} dot>{label}</Badge>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <ChevronRight className="w-4 h-4 text-gray-300 mx-auto" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50/60 border-t border-gray-100">
                  <tr>
                    <td colSpan={3} className="px-5 py-3 text-xs font-bold text-gray-600">
                      {filtered.length} quotation{filtered.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-blue-700">
                      {formatCurrency(totalValue)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
