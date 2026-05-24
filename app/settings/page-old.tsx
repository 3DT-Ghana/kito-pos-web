'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import { useTenant } from '@/hooks/useTenant'

/**
 * Settings Page
 *
 * Tenant settings and user management (OWNER only)
 */

interface TenantData {
  id: string
  businessName: string
  createdAt: Date
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, isOwner } = useUser()
  const { tenantId } = useTenant()

  const [tenant, setTenant] = useState<TenantData | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOwner) {
      router.push('/dashboard')
      return
    }

    if (tenantId) {
      fetchTenantSettings()
    }
  }, [isOwner, tenantId, router])

  const fetchTenantSettings = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/tenants/${tenantId}`)
      if (!response.ok) throw new Error('Failed to fetch settings')
      const data = await response.json()
      setTenant(data.data)
      setBusinessName(data.data.businessName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!businessName.trim()) {
      setError('Business name is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: businessName.trim() }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update settings')
      }

      alert('Settings updated successfully!')
      fetchTenantSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOwner) {
    return null
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-500">Loading settings...</div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your business settings
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3">
            {error}
          </div>
        )}

        {/* Business Settings */}
        <div className="bg-white shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Business Information</h2>
            <p className="text-sm text-gray-500 mt-1">
              Update your business details
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Business Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Name *
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your Business Name"
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSubmitting}
              />
            </div>

            {/* Tenant ID (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tenant ID
              </label>
              <input
                type="text"
                value={tenant?.id || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 bg-gray-50 text-gray-500 font-mono text-sm"
              />
            </div>

            {/* Created Date (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Created
              </label>
              <input
                type="text"
                value={tenant?.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 bg-gray-50 text-gray-500"
              />
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Account Information */}
        <div className="bg-white shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Your Account</h2>
            <p className="text-sm text-gray-500 mt-1">
              Your user information
            </p>
          </div>

          <div className="p-6 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={user?.name || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 bg-gray-50 text-gray-500"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 bg-gray-50 text-gray-500"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <input
                type="text"
                value={user?.role || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 bg-gray-50 text-gray-500"
              />
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white shadow-sm border border-red-200">
          <div className="p-6 border-b border-red-200">
            <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
            <p className="text-sm text-red-600 mt-1">
              Irreversible and destructive actions
            </p>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Delete Account</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Permanently delete your business account and all data
                </p>
              </div>
              <button
                onClick={() => alert('Account deletion is not implemented in this demo')}
                className="px-4 py-2 bg-red-600 text-white font-medium hover:bg-red-700"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
