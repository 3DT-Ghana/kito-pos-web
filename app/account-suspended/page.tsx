'use client'

import { signOut } from 'next-auth/react'
import { ShieldX } from 'lucide-react'

export default function AccountSuspendedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-red-200 shadow-sm p-8 text-center">
          <div className="w-14 h-14 bg-red-100 flex items-center justify-center mx-auto mb-5">
            <ShieldX className="w-7 h-7 text-red-600" />
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">Account Suspended</h1>

          <p className="text-sm text-gray-600 leading-relaxed mb-6">
            Your account has been suspended for malicious actions or the company has been deactivated.
            If you believe this is a mistake, please contact support.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => signOut({ callbackUrl: '/auth/login' })}
              className="w-full h-10 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
            >
              Sign out
            </button>
            <a
              href="mailto:support@salesinventory.com"
              className="block w-full h-10 border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center"
            >
              Contact Support
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Sales &amp; Inventory Management
        </p>
      </div>
    </div>
  )
}
