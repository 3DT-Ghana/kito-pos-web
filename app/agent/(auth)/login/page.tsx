'use client'

import { useState, FormEvent } from 'react'
import { getSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, AlertCircle, ArrowRight, MapPin } from 'lucide-react'

export default function AgentLoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) {
      setLoading(false)
      setError('Invalid email or password.')
      return
    }
    const session = await getSession()
    router.refresh()
    router.push(session?.user.agentStatus === 'PENDING' ? '/agent/profile' : '/agent/dashboard')
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel — brand ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[50%] flex-col bg-[#0d2a2a] relative overflow-hidden select-none">

        <div className="absolute top-0 right-0 w-56 h-56 bg-teal-500/10 border-l border-b border-teal-400/20" />
        <div className="absolute bottom-0 left-0 w-44 h-44 bg-teal-500/8 border-t border-r border-teal-400/15" />
        <div className="absolute inset-x-0 top-[44%] h-px bg-white/5" />

        <div className="relative flex-1 flex flex-col justify-center px-10 xl:px-16 pb-16 pt-16">
          <p className="text-teal-400 text-xs font-semibold uppercase tracking-[0.18em] mb-5">
            Sales Agent Portal
          </p>
          <h1 className="text-white text-4xl xl:text-5xl font-bold leading-[1.15] tracking-tight">
            Sell smarter,<br />earn more,<br />
            <span className="text-teal-400">grow faster.</span>
          </h1>
          <p className="mt-6 text-slate-400 text-base leading-relaxed max-w-sm">
            Manage your portfolio, track commissions, and process orders from anywhere — all in one place.
          </p>

          <div className="mt-12 flex items-center gap-8">
            {[
              { value: 'Live Orders',  label: 'Tracking' },
              { value: 'Commission',   label: 'Dashboard' },
              { value: 'Mobile-first', label: 'Experience' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-white text-sm font-bold">{s.value}</p>
                <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-end px-10 pb-8">
          <Link
            href="/auth/login"
            className="text-xs text-slate-500 hover:text-slate-300 transition flex items-center gap-1"
          >
            Business login <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* ── Right panel — form ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-slate-50">

        {/* Form area */}
        <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-14 xl:px-20 py-10">
          <div className="w-full max-w-sm mx-auto lg:mx-0">

            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Agent sign in</h2>
              <p className="mt-1.5 text-sm text-gray-500">Access your dashboard and portfolio</p>
            </div>

            {/* Animated card */}
            <div
              className="bg-white shadow-lg ring-1 ring-black/5 p-6 sm:p-7"
              style={{ animation: 'cardIn 0.35s cubic-bezier(0.16,1,0.3,1) both' }}
            >
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
                    placeholder="you@example.com"
                    className="block w-full h-11 border border-gray-300 bg-white px-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15 transition"
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
                      className="text-xs text-teal-600 hover:text-teal-700 font-medium transition"
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
                      className="block w-full h-11 border border-gray-300 bg-white px-3.5 pr-11 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15 transition"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPw(v => !v)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600 transition"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <><Spinner />Signing in…</> : 'Sign in'}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-3">Don&apos;t have an agent account?</p>
                <Link
                  href="/agent/register"
                  className="flex items-center justify-between w-full px-4 py-3 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition group"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-700">Create an agent account</p>
                    <p className="text-xs text-gray-400 mt-0.5">Register to join the network</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" />
                </Link>
              </div>
            </div>

            <p className="mt-5 text-xs text-gray-400 text-center">
              Business staff?{' '}
              <Link href="/auth/login" className="font-medium text-gray-600 hover:text-gray-800 transition">
                Use the business login
              </Link>
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
  return <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
}
