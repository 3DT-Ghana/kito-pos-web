'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminLayout } from '@/components/layout/AdminLayout'

interface Application {
  id: string
  businessName: string
  businessType: string
  businessAddress: string
  ownerFullName: string
  status: string
  createdAt: string
  agent: {
    id: string
    agentCode: string
    fullName: string
    email: string
  }
}

type FilterStatus = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('ALL')

  useEffect(() => {
    const url =
      filter !== 'ALL'
        ? `/api/admin/applications?status=${filter}`
        : '/api/admin/applications'
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setApplications(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [filter])

  const filters: FilterStatus[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Applications</h1>
          <p className="text-sm text-gray-500 mt-0.5">All tenant onboarding applications</p>
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {filters.map((s) => (
            <button
              key={s}
              onClick={() => {
                setLoading(true)
                setFilter(s)
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                filter === s
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : applications.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">No applications found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Business</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Agent</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden sm:table-cell">Owner</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/applications/${app.id}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {app.businessName}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{app.businessAddress}</p>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-gray-600">
                      <Link href={`/admin/agents/${app.agent.id}`} className="hover:underline">
                        {app.agent.fullName}
                      </Link>
                      <p className="text-xs text-gray-400">{app.agent.agentCode}</p>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell text-gray-600">{app.ownerFullName}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell text-gray-400 text-xs">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
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
