'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { ChevronLeft, Award, Building2, TrendingUp, FileText } from 'lucide-react'
import Image from 'next/image'

interface Application {
  id: string
  businessName: string
  businessType: string
  status: string
  createdAt: string
  tenantId: string | null
}

interface Agent {
  id: string
  agentCode: string
  fullName: string
  phone: string
  email: string
  ghanaCardNumber: string | null
  ghanaCardImageUrl: string | null
  residentialAddress: string | null
  territory: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  registeredByAdminEmail: string | null
  rejectionReason: string | null
  status: string
  approvedAt: string | null
  approvedById: string | null
  createdAt: string
  onboardedBusinesses: Application[]
}

interface AgentReportRow {
  id: string
  onboardedRevenue: number
  estimatedCommission: number
  approvedApplications: number
  pendingApplications: number
  rejectedApplications: number
  totalApplications: number
}

const STATUS_BADGE: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  APPROVED:  'bg-emerald-100 text-emerald-700',
  REJECTED:  'bg-red-100 text-red-700',
  SUSPENDED: 'bg-gray-100 text-gray-600',
  TRIAL:     'bg-amber-100 text-amber-700',
  ACTIVE:    'bg-emerald-100 text-emerald-700',
}

function Sb({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

export default function AdminAgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [report, setReport] = useState<AgentReportRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectionReasonInput, setRejectionReasonInput] = useState('')
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    const [agentRes, reportRes] = await Promise.all([
      fetch(`/api/admin/agents/${id}`),
      fetch('/api/admin/reports'),
    ])
    const agentData = await agentRes.json()
    setAgent(agentData.id ? agentData : null)
    setRejectionReasonInput(agentData?.rejectionReason ?? '')

    if (reportRes.ok) {
      const reportData = await reportRes.json()
      const row = (reportData.agentReport ?? []).find((r: AgentReportRow) => r.id === id) ?? null
      setReport(row)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function updateStatus(status: string) {
    const trimmedRejectionReason = rejectionReasonInput.trim()

    if (status === 'REJECTED' && !trimmedRejectionReason) {
      setResult({ type: 'error', text: 'A rejection reason is required to reject this agent.' })
      return
    }

    setActionLoading(true)
    setResult(null)

    const res = await fetch(`/api/admin/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        ...(status === 'REJECTED' ? { rejectionReason: trimmedRejectionReason } : {}),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setActionLoading(false)

    if (!res.ok) {
      setResult({ type: 'error', text: data.error ?? 'Failed to update agent' })
      return
    }

    setResult({
      type: 'success',
      text:
        status === 'APPROVED'
          ? 'Agent approved successfully.'
          : status === 'REJECTED'
            ? 'Agent rejected successfully.'
            : 'Agent suspended successfully.',
    })
    load()
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    )
  }

  if (!agent) {
    return (
      <AdminLayout>
        <p className="text-sm text-red-500">Agent not found.</p>
      </AdminLayout>
    )
  }

  const approvedApps = agent.onboardedBusinesses.filter(a => a.status === 'APPROVED')
  const pendingApps  = agent.onboardedBusinesses.filter(a => a.status === 'PENDING')
  const rejectedApps = agent.onboardedBusinesses.filter(a => a.status === 'REJECTED')
  const conversionRate = agent.onboardedBusinesses.length > 0
    ? Math.round((approvedApps.length / agent.onboardedBusinesses.length) * 100)
    : 0

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Back */}
        <Link href="/admin/agents" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Agents
        </Link>

        {/* Title + status */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-md shrink-0">
            {agent.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{agent.fullName}</h1>
              <Sb status={agent.status} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{agent.agentCode} · {agent.email}</p>
            {agent.territory && (
              <p className="text-xs text-gray-400 mt-0.5">Territory: {agent.territory}</p>
            )}
          </div>
        </div>

        {result && (
          <div className={`text-sm px-4 py-3 rounded-lg border ${result.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
            {result.text}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {agent.status === 'PENDING' && (
            <>
              <button
                onClick={() => updateStatus('APPROVED')}
                disabled={actionLoading}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                Approve Agent
              </button>
              <button
                onClick={() => updateStatus('REJECTED')}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 text-sm font-semibold rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
            </>
          )}
          {agent.status === 'APPROVED' && (
            <button
              onClick={() => updateStatus('SUSPENDED')}
              disabled={actionLoading}
              className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-200 text-sm font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Suspend Agent
            </button>
          )}
          {agent.status === 'SUSPENDED' && (
            <button
              onClick={() => updateStatus('APPROVED')}
              disabled={actionLoading}
              className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-semibold rounded-xl hover:bg-emerald-100 disabled:opacity-50 transition-colors"
            >
              Reinstate Agent
            </button>
          )}
          <Link
            href="/admin/reports"
            className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-sm font-semibold rounded-xl hover:bg-indigo-100 transition-colors"
          >
            Full Reports
          </Link>
        </div>

        {agent.status === 'PENDING' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Review Decision</h2>
            <label className="block text-xs text-gray-500 font-medium mb-1.5">
              Rejection reason (required only if rejecting)
            </label>
            <input
              type="text"
              value={rejectionReasonInput}
              onChange={(event) => setRejectionReasonInput(event.target.value)}
              placeholder="e.g. Missing Ghana Card upload"
              className="w-full max-w-lg px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

        {/* Performance scorecard */}
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Performance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <PerfCard
              icon={<FileText className="w-4 h-4" />}
              label="Applications"
              value={String(agent.onboardedBusinesses.length)}
              color="indigo"
            />
            <PerfCard
              icon={<Building2 className="w-4 h-4" />}
              label="Onboarded"
              value={String(approvedApps.length)}
              color="emerald"
              sub={`${conversionRate}% conversion`}
            />
            <PerfCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Shop Revenue"
              value={report?.onboardedRevenue ? formatCurrency(report.onboardedRevenue) : '—'}
              color="blue"
              small
            />
            <PerfCard
              icon={<Award className="w-4 h-4" />}
              label="Est. Commission"
              value={report?.estimatedCommission ? formatCurrency(report.estimatedCommission) : '—'}
              color="purple"
              small
              sub="2% of shop revenue"
            />
          </div>

          {/* Application breakdown bar */}
          {agent.onboardedBusinesses.length > 0 && (
            <div className="mt-3 bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span>Application breakdown</span>
                <span>{agent.onboardedBusinesses.length} total</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden gap-px">
                {approvedApps.length > 0 && (
                  <div
                    className="bg-emerald-500 rounded-l-full"
                    style={{ width: `${(approvedApps.length / agent.onboardedBusinesses.length) * 100}%` }}
                  />
                )}
                {pendingApps.length > 0 && (
                  <div
                    className="bg-amber-400"
                    style={{ width: `${(pendingApps.length / agent.onboardedBusinesses.length) * 100}%` }}
                  />
                )}
                {rejectedApps.length > 0 && (
                  <div
                    className="bg-red-400 rounded-r-full"
                    style={{ width: `${(rejectedApps.length / agent.onboardedBusinesses.length) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1 text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{approvedApps.length} approved</span>
                {pendingApps.length > 0 && <span className="flex items-center gap-1 text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{pendingApps.length} pending</span>}
                {rejectedApps.length > 0 && <span className="flex items-center gap-1 text-red-600"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />{rejectedApps.length} rejected</span>}
              </div>
            </div>
          )}
        </div>

        {/* Profile details */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Profile</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Row label="Phone" value={agent.phone} />
            <Row label="Territory" value={agent.territory ?? '—'} />
            <Row label="Residential Address" value={agent.residentialAddress ?? '—'} />
            <Row label="Joined" value={formatDate(agent.createdAt)} />
            {agent.approvedAt && <Row label="Approved on" value={formatDate(agent.approvedAt)} />}
            {agent.approvedById && <Row label="Approved by" value={agent.approvedById} />}
            {agent.registeredByAdminEmail && (
              <Row label="Registered by Admin" value={agent.registeredByAdminEmail} />
            )}
            {agent.emergencyContactName && (
              <Row label="Emergency Contact" value={`${agent.emergencyContactName}${agent.emergencyContactPhone ? ` · ${agent.emergencyContactPhone}` : ''}`} />
            )}
            {agent.rejectionReason && (
              <Row label="Rejection Reason" value={agent.rejectionReason} />
            )}
          </div>
        </div>

        {/* Ghana Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Ghana Card (KYC)</h2>
          {agent.ghanaCardNumber ? (
            <p className="text-sm text-gray-700 mb-3">Card No: <span className="font-semibold font-mono">{agent.ghanaCardNumber}</span></p>
          ) : (
            <p className="text-sm text-gray-400 italic mb-3">No card number provided</p>
          )}
          {agent.ghanaCardImageUrl ? (
            <div className="relative w-full max-w-sm h-44 rounded-xl overflow-hidden border border-gray-200">
              <Image src={agent.ghanaCardImageUrl} alt="Ghana Card" fill className="object-contain" />
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No image uploaded</p>
          )}
        </div>

        {/* Business applications */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Business Applications</h2>
            <span className="text-xs text-gray-400">{agent.onboardedBusinesses.length} total</span>
          </div>
          {agent.onboardedBusinesses.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">No applications submitted yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {agent.onboardedBusinesses
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map(app => (
                  <li key={app.id}>
                    <Link
                      href={`/admin/applications/${app.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        app.status === 'APPROVED' ? 'bg-emerald-50' : app.status === 'PENDING' ? 'bg-amber-50' : 'bg-red-50'
                      }`}>
                        <Building2 className={`w-4 h-4 ${
                          app.status === 'APPROVED' ? 'text-emerald-600' : app.status === 'PENDING' ? 'text-amber-600' : 'text-red-500'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{app.businessName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {app.businessType.charAt(0) + app.businessType.slice(1).toLowerCase()} · {formatDate(app.createdAt)}
                        </p>
                      </div>
                      <Sb status={app.status} />
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>

      </div>
    </AdminLayout>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  )
}

function PerfCard({
  icon, label, value, color, sub, small,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  sub?: string
  small?: boolean
}) {
  const colors: Record<string, { bg: string; icon: string; val: string }> = {
    indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  val: 'text-indigo-700' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', val: 'text-emerald-700' },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    val: 'text-blue-700' },
    purple:  { bg: 'bg-purple-50',  icon: 'text-purple-600',  val: 'text-purple-700' },
  }
  const c = colors[color] ?? colors.indigo
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-8 h-8 rounded-lg ${c.bg} ${c.icon} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`font-bold mt-0.5 ${c.val} ${small ? 'text-sm' : 'text-2xl'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
