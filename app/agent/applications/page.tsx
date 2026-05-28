'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PencilLine, Plus, Trash2 } from 'lucide-react'

interface Application {
  id: string
  businessName: string
  businessType: string
  businessAddress: string
  ownerFullName: string
  status: string
  createdAt: string
  rejectionReason: string | null
}

export default function AgentApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agent/applications')
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load applications')
        }

        setApplications(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load applications'
        )
        setLoading(false)
      })
  }, [])

  async function deleteApplication(app: Application) {
    if (
      !window.confirm(
        `Delete "${app.businessName}"? This rejected application will be removed permanently.`
      )
    ) {
      return
    }

    setDeletingId(app.id)
    setError(null)

    try {
      const response = await fetch(`/api/agent/applications/${app.id}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete application')
      }

      setApplications((prev) =>
        prev.filter((application) => application.id !== app.id)
      )
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Failed to delete application'
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
          <p className="text-sm text-gray-500 mt-0.5">Businesses you&apos;ve submitted for onboarding</p>
        </div>
        <Link
          href="/agent/applications/new"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Application
        </Link>
      </div>

      {error && (
        <div className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : applications.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No applications yet.{' '}
            <Link href="/agent/applications/new" className="text-indigo-600 hover:underline">
              Submit your first one.
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">Business</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 hidden sm:table-cell">Type</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Owner</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 hidden sm:table-cell">Date</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {applications.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      href={`/agent/applications/${app.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {app.businessName}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{app.businessAddress}</p>
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell text-gray-600 capitalize">
                    {app.businessType.toLowerCase()}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell text-gray-600">{app.ownerFullName}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell text-gray-400 text-xs">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3">
                    {app.status === 'REJECTED' ? (
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/agent/applications/${app.id}/edit`}
                          className="inline-flex items-center gap-1 border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => void deleteApplication(app)}
                          disabled={deletingId === app.id}
                          className="inline-flex items-center gap-1 border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingId === app.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    ) : (
                      <div className="text-right text-xs text-gray-300">-</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <span className={`text-xs font-medium px-2.5 py-0.5 -full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}
