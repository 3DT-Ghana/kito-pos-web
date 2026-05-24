'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, CheckCircle, Clock, XCircle, Plus } from 'lucide-react'

interface Application {
  id: string
  businessName: string
  status: string
  createdAt: string
}

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
}

export default function AgentDashboardPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/agent/applications')
      .then((r) => r.json())
      .then((data) => {
        setApplications(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const stats: Stats = {
    total: applications.length,
    pending: applications.filter((a) => a.status === 'PENDING').length,
    approved: applications.filter((a) => a.status === 'APPROVED').length,
    rejected: applications.filter((a) => a.status === 'REJECTED').length,
  }

  const statCards = [
    { label: 'Total Submitted', value: stats.total, icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Approved', value: stats.approved, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your business onboarding summary</p>
        </div>
        <Link
          href="/agent/applications/new"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Application
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-gray-200 p-5">
            <div className={`inline-flex p-2 ${bg} mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '–' : value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent applications */}
      <div className="bg-white border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Recent Applications</h2>
          <Link href="/agent/applications" className="text-xs text-indigo-600 hover:underline">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : applications.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No applications yet.{' '}
            <Link href="/agent/applications/new" className="text-indigo-600 hover:underline">
              Submit your first one.
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {applications.slice(0, 5).map((app) => (
              <li key={app.id}>
                <Link
                  href={`/agent/applications/${app.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{app.businessName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={app.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-red-100 text-red-700',
    SUSPENDED: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}
