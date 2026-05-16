'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AgentRegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    residentialAddress: '',
    territory: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/agent/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Registration failed')
        return
      }

      router.push(`/agent/login?registered=1&code=${data.agentCode}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fields: { name: keyof typeof form; label: string; type?: string; required?: boolean; placeholder?: string }[] = [
    { name: 'fullName', label: 'Full Name', required: true, placeholder: 'John Doe' },
    { name: 'phone', label: 'Phone Number', required: true, placeholder: '+233 24 000 0000' },
    { name: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'you@example.com' },
    { name: 'password', label: 'Password', type: 'password', required: true, placeholder: 'Min. 8 characters' },
    { name: 'residentialAddress', label: 'Residential Address', placeholder: 'e.g. Kasoa, Accra' },
    { name: 'territory', label: 'Territory / Region', placeholder: 'e.g. Greater Accra' },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Become an Agent</h1>
          <p className="text-gray-500 mt-1 text-sm">Register to start onboarding businesses</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-100">
              {error}
            </div>
          )}

          {fields.map(({ name, label, type = 'text', required, placeholder }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {label} {required && <span className="text-red-500">*</span>}
              </label>
              <input
                type={type}
                name={name}
                value={form[name]}
                onChange={handleChange}
                required={required}
                placeholder={placeholder}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors mt-2"
          >
            {loading ? 'Registering…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          Already have an account?{' '}
          <Link href="/agent/login" className="text-indigo-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
