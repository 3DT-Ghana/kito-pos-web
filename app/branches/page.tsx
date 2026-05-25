'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatDate } from '@/lib/utils/format'
import { useBranch } from '@/lib/branch/BranchContext'
import { useUser } from '@/hooks/useUser'
import { Pagination } from '@/components/ui/Pagination'

interface Branch {
  id: string
  name: string
  address: string | null
  phone: string | null
  isDefault: boolean
  createdAt: string
  _count: { users: number }
}

export default function BranchesPage() {
  const router = useRouter()
  const { refreshBranches } = useBranch()
  const { isOwner, isLoading: isUserLoading } = useUser()
  const [branches, setBranches] = useState<Branch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', address: '', phone: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  useEffect(() => {
    if (!isUserLoading && !isOwner) {
      router.push('/dashboard')
      return
    }

    if (isOwner) {
      let isActive = true

      const loadBranches = async () => {
        try {
          const res = await fetch('/api/branches')
          if (!res.ok) throw new Error()
          const data = await res.json()
          if (!isActive) return
          setBranches(data.branches || [])
        } finally {
          if (isActive) {
            setIsLoading(false)
          }
        }
      }

      void loadBranches()

      return () => {
        isActive = false
      }
    }
  }, [isOwner, isUserLoading, router])

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setBranches(data.branches || [])
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveError('')
    if (!formData.name.trim()) { setSaveError('Branch name is required'); return }
    setIsSaving(true)
    try {
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create branch')
      }
      setFormData({ name: '', address: '', phone: '' })
      setShowForm(false)
      await refreshBranches()
      fetchBranches()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create branch')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    await fetch(`/api/branches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    })
    await refreshBranches()
    fetchBranches()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete branch "${name}"? Users assigned to this branch will become unassigned.`)) return
    const res = await fetch(`/api/branches/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      alert(err.error || 'Failed to delete branch')
      return
    }
    await refreshBranches()
    fetchBranches()
  }

  if (isUserLoading || !isOwner) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent -full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Branches</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage your business locations</p>
          </div>
          <button
            onClick={() => { setShowForm(v => !v); setSaveError('') }}
            className="px-4 py-2 bg-blue-600 text-white font-bold hover:bg-blue-700 text-sm"
          >
            {showForm ? 'Cancel' : '+ New Branch'}
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white border-2 border-blue-200 p-5 space-y-4">
            <h2 className="text-base font-bold text-gray-900">New Branch</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Branch Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(v => ({ ...v, name: e.target.value }))}
                  placeholder="e.g. Main Shop, Accra Branch"
                  className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={e => setFormData(v => ({ ...v, phone: e.target.value }))}
                  placeholder="e.g. 0244123456"
                  className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={e => setFormData(v => ({ ...v, address: e.target.value }))}
                placeholder="e.g. 12 Oxford St, Osu, Accra"
                className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
            {saveError && (
              <p className="text-sm text-red-600 font-medium">{saveError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowForm(false); setSaveError('') }}
                className="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-2.5 bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {isSaving ? 'Creating...' : 'Create Branch'}
              </button>
            </div>
          </form>
        )}

        {/* Branch List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="bg-white h-28 animate-pulse border border-gray-200" />
            ))}
          </div>
        ) : branches.length === 0 ? (
          <div className="bg-white border border-gray-200 py-16 text-center">
            <p className="text-4xl mb-3">🏪</p>
            <p className="text-gray-500 font-medium">No branches yet</p>
            <p className="text-sm text-gray-400 mt-1">Create your first branch to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {branches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(branch => (
              <div
                key={branch.id}
                className={`bg-white border-2 p-5 ${branch.isDefault ? 'border-green-300' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-10 h-10 flex items-center justify-center text-lg shrink-0 ${branch.isDefault ? 'bg-green-100' : 'bg-blue-100'}`}>
                      🏪
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900">{branch.name}</h3>
                        {branch.isDefault && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 -full font-semibold">Default</span>
                        )}
                      </div>
                      {branch.address && <p className="text-sm text-gray-500 mt-0.5">{branch.address}</p>}
                      {branch.phone && <p className="text-sm text-gray-500">{branch.phone}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{branch._count.users} user{branch._count.users !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span>Created {formatDate(branch.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => router.push(`/branches/${branch.id}`)}
                      className="px-3 py-1.5 border-2 border-gray-200 text-gray-700 font-semibold text-xs hover:bg-gray-50"
                    >
                      Manage
                    </button>
                    {!branch.isDefault && (
                      <>
                        <button
                          onClick={() => handleSetDefault(branch.id)}
                          className="px-3 py-1.5 border-2 border-green-200 text-green-700 font-semibold text-xs hover:bg-green-50"
                        >
                          Set Default
                        </button>
                        <button
                          onClick={() => handleDelete(branch.id, branch.name)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 border-2 border-red-100 font-semibold text-xs hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {branches.length > PAGE_SIZE && (
          <Pagination page={page} totalPages={Math.ceil(branches.length / PAGE_SIZE)} onPageChange={setPage} totalItems={branches.length} pageSize={PAGE_SIZE} />
        )}

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 space-y-1.5">
          <p className="font-bold">About Branches</p>
          <ul className="space-y-1 text-blue-700">
            <li>• Each branch has its own inventory, sales, and cash register</li>
            <li>• The <strong>Default</strong> branch is pre-selected for all new records</li>
            <li>• Owners can view data across all branches from the consolidated dashboard</li>
            <li>• Users can be assigned to a specific branch from the Users page</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  )
}
