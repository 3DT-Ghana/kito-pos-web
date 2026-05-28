'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { formatDate } from '@/lib/utils/format'
import { Key, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react'

interface PlatformAdminRecord {
  id: string
  name: string
  email: string
  createdByEmail: string | null
  createdAt: string
  updatedAt: string
}

const emptyCreateForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
}

const emptyResetForm = {
  password: '',
  confirmPassword: '',
}

export default function PlatformAdminsPage() {
  const [platformAdmins, setPlatformAdmins] = useState<PlatformAdminRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [resetForm, setResetForm] = useState(emptyResetForm)
  const [resetTarget, setResetTarget] = useState<PlatformAdminRecord | null>(null)

  const loadPlatformAdmins = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/platform-admins', { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load platform admins')
      }

      setPlatformAdmins(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform admins')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlatformAdmins()
  }, [loadPlatformAdmins])

  const handleCreatePlatformAdmin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (createForm.password.length < 8) {
      setError('Platform admin password must be at least 8 characters')
      return
    }

    if (createForm.password !== createForm.confirmPassword) {
      setError('Platform admin passwords do not match')
      return
    }

    setSaving(true)

    try {
      const res = await fetch('/api/admin/platform-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          password: createForm.password,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create platform admin')
      }

      setSuccess(`Platform admin "${data.name}" created successfully.`)
      setCreateForm(emptyCreateForm)
      setPlatformAdmins((prev) => [data, ...prev.filter((platformAdmin) => platformAdmin.id !== data.id)])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create platform admin')
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!resetTarget) {
      return
    }

    setError('')
    setSuccess('')

    if (resetForm.password.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }

    if (resetForm.password !== resetForm.confirmPassword) {
      setError('New passwords do not match')
      return
    }

    setResetting(true)

    try {
      const res = await fetch(`/api/admin/platform-admins/${resetTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetForm.password }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password')
      }

      setSuccess(`Password reset for "${resetTarget.name}" completed.`)
      setResetForm(emptyResetForm)
      setResetTarget(null)
      setPlatformAdmins((prev) =>
        prev.map((platformAdmin) => (platformAdmin.id === data.id ? data : platformAdmin))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setResetting(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Admins</h1>
            <p className="mt-1 text-sm text-gray-500">
              Create tenantless platform admin accounts and reset their passwords from one place.
            </p>
          </div>
          <button
            onClick={() => void loadPlatformAdmins()}
            className="inline-flex items-center justify-center gap-2 border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error && (
          <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <section className="border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-indigo-600" />
                <h2 className="text-lg font-semibold text-gray-900">Create Platform Admin</h2>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                New platform admins are independent from business tenants and go straight into the admin portal.
              </p>
            </div>

            <form onSubmit={handleCreatePlatformAdmin} className="space-y-5 p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Full name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Platform admin name"
                    className="h-11 w-full border border-gray-300 px-3.5 text-sm text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="admin@example.com"
                    className="h-11 w-full border border-gray-300 px-3.5 text-sm text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Minimum 8 characters"
                    className="h-11 w-full border border-gray-300 px-3.5 text-sm text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirm password</label>
                  <input
                    type="password"
                    value={createForm.confirmPassword}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Repeat the password"
                    className="h-11 w-full border border-gray-300 px-3.5 text-sm text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />
                {saving ? 'Creating...' : 'Create Platform Admin'}
              </button>
            </form>
          </section>

          <section className="border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-600" />
                <h2 className="text-lg font-semibold text-gray-900">Reset Password</h2>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Choose an admin from the table below to issue a new password.
              </p>
            </div>

            {resetTarget ? (
              <form onSubmit={handleResetPassword} className="space-y-5 p-6">
                <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Resetting password for <span className="font-semibold">{resetTarget.name}</span> ({resetTarget.email})
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">New password</label>
                  <input
                    type="password"
                    value={resetForm.password}
                    onChange={(e) => setResetForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Minimum 8 characters"
                    className="h-11 w-full border border-gray-300 px-3.5 text-sm text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirm new password</label>
                  <input
                    type="password"
                    value={resetForm.confirmPassword}
                    onChange={(e) => setResetForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Repeat the new password"
                    className="h-11 w-full border border-gray-300 px-3.5 text-sm text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
                    required
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={resetting}
                    className="inline-flex items-center justify-center gap-2 bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Key className="h-4 w-4" />
                    {resetting ? 'Resetting...' : 'Reset Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetTarget(null)
                      setResetForm(emptyResetForm)
                    }}
                    className="border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
                <ShieldCheck className="mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm font-medium text-gray-700">No platform admin selected</p>
                <p className="mt-1 max-w-sm text-sm text-gray-500">
                  Use the table below and click <span className="font-semibold text-gray-700">Reset password</span> on any account.
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="overflow-hidden border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Current Platform Admin Accounts</h2>
            <p className="mt-1 text-sm text-gray-500">
              These accounts sign in directly to the platform admin portal and are not attached to any tenant.
            </p>
          </div>

          {loading ? (
            <div className="space-y-0 divide-y divide-gray-100">
              {[...Array(6)].map((_, index) => (
                <div key={index} className="grid grid-cols-5 gap-4 px-6 py-4">
                  <div className="h-4 bg-gray-200" />
                  <div className="h-4 bg-gray-200" />
                  <div className="h-4 bg-gray-200" />
                  <div className="h-4 bg-gray-200" />
                  <div className="h-4 bg-gray-200" />
                </div>
              ))}
            </div>
          ) : platformAdmins.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <ShieldCheck className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">No platform admins found</p>
              <p className="mt-1 text-sm text-gray-500">
                Create the first tenantless platform admin account above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Created By</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last Updated</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {platformAdmins.map((platformAdmin) => (
                    <tr key={platformAdmin.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{platformAdmin.name}</div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{platformAdmin.email}</td>
                      <td className="px-6 py-4 text-gray-600">{formatDate(platformAdmin.createdAt)}</td>
                      <td className="px-6 py-4 text-gray-600">{platformAdmin.createdByEmail || 'System migration'}</td>
                      <td className="px-6 py-4 text-gray-600">{formatDate(platformAdmin.updatedAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(platformAdmin)
                            setResetForm(emptyResetForm)
                            setError('')
                            setSuccess('')
                          }}
                          className="inline-flex items-center justify-center gap-2 border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          <Key className="h-4 w-4" />
                          Reset password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}
