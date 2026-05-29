'use client'

import { FormEvent, useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, AlertCircle, Info, ArrowRight } from 'lucide-react'

type LoginView = 'business' | 'admin'

export function ImprovedLogin({
  error: initialError,
  notice,
  portal = 'business',
}: {
  error?: string
  notice?: string
  portal?: LoginView
}) {
  const router   = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(initialError || '')
  const isAdminPortal = portal === 'admin'

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
        portal,
      })
      if (result?.error) {
        setError('Invalid email or password.')
        setLoading(false)
      } else {
        const session = await getSession()
        router.push(session?.user?.platformRole === 'SUPER_ADMIN' ? '/admin' : '/dashboard')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel — brand ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col bg-[#0f172a] relative overflow-hidden select-none">

        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 border-l border-b border-blue-500/20" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/8 border-t border-r border-blue-500/15" />
        <div className="absolute inset-x-0 top-[42%] h-px bg-white/5" />

        <div className="relative flex-1 flex flex-col justify-center px-10 xl:px-16 pb-16 pt-16">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-[0.18em] mb-5">
            Sales &amp; Inventory Management
          </p>
          <h1 className="text-white text-4xl xl:text-5xl font-bold leading-[1.15] tracking-tight">
            Manage your<br />business with<br />
            <span className="text-blue-400">clarity.</span>
          </h1>
          <p className="mt-6 text-slate-400 text-base leading-relaxed max-w-sm">
            One platform for sales, inventory, purchasing, payroll, and accounting — built for growing businesses.
          </p>

          <div className="mt-12 flex items-center gap-8">
            {[
              { value: 'Multi-branch', label: 'Support' },
              { value: 'Real-time',    label: 'Reporting' },
              { value: 'Ghana PAYE',   label: 'Payroll' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-white text-sm font-bold">{s.value}</p>
                <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-end px-10 pb-8">
          <a
            href="/agent/login"
            className="text-xs text-slate-500 hover:text-slate-300 transition flex items-center gap-1"
          >
            Sales Agent portal <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* ── Right panel — form ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-slate-50">

        {/* Form area */}
        <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-14 xl:px-20 py-10">
          <div className="w-full max-w-sm mx-auto lg:mx-0">

            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                {isAdminPortal ? 'Platform admin sign in' : 'Welcome back'}
              </h2>
              <p className="mt-1.5 text-sm text-gray-500">
                {isAdminPortal
                  ? 'Sign in to the platform administration portal'
                  : 'Sign in to your business workspace or platform admin portal'}
              </p>
            </div>

            {/* Animated card */}
            <div
              className="bg-white shadow-lg ring-1 ring-black/5 p-6 sm:p-7"
              style={{ animation: 'cardIn 0.35s cubic-bezier(0.16,1,0.3,1) both' }}
            >
              {notice && (
                <div className="mb-5 flex items-start gap-2.5 border border-blue-200 bg-blue-50 px-3.5 py-3">
                  <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700">{notice}</p>
                </div>
              )}
              {error && (
                <div className="mb-5 flex items-start gap-2.5 border border-red-200 bg-red-50 px-3.5 py-3">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="block w-full h-11 border border-gray-300 bg-white px-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium transition"
                    >
                      {showPw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full h-11 border border-gray-300 bg-white px-3.5 pr-11 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 transition"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPw(v => !v)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600 transition"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <><Spinner />Signing in…</> : 'Sign in'}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-gray-100 space-y-3">
                <a
                  href={isAdminPortal ? '/auth/login' : '/auth/login?portal=admin'}
                  className="flex items-center justify-between w-full px-4 py-3 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition group"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {isAdminPortal ? 'Business Staff Portal' : 'Platform Admin Portal'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {isAdminPortal
                        ? 'Switch back to the normal business login'
                        : 'Sign in as a tenantless platform admin'}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" />
                </a>

                <p className="text-xs text-gray-400">
                  {isAdminPortal ? 'Not a platform admin?' : 'Not a business staff member?'}
                </p>
                <a
                  href="/agent/login"
                  className="flex items-center justify-between w-full px-4 py-3 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition group"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-700">Sales Agent Portal</p>
                    <p className="text-xs text-gray-400 mt-0.5">Sign in to your agent account</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" />
                </a>
              </div>
            </div>

            <p className="mt-5 text-xs text-gray-400 text-center">
              Authorised staff only — contact your administrator for access.
            </p>

          </div>
        </div>
      </div>

      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  )
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-white border-t-transparent -full animate-spin" />
}
