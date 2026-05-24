'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User, Phone, Mail, Lock, MapPin, Shield, Users } from 'lucide-react'

type Step = 1 | 2 | 3

interface KYCSettings {
  requireAgentGhanaCardNumber: boolean
  requireAgentGhanaCardUpload: boolean
}

interface FormData {
  fullName: string
  phone: string
  email: string
  password: string
  confirmPassword: string
  residentialAddress: string
  territory: string
  ghanaCardNumber: string
  emergencyContactName: string
  emergencyContactPhone: string
}

export default function AgentRegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [kyc, setKyc] = useState<KYCSettings>({
    requireAgentGhanaCardNumber: true,
    requireAgentGhanaCardUpload: false,
  })
  const [form, setForm] = useState<FormData>({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    residentialAddress: '',
    territory: '',
    ghanaCardNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/agent/kyc-settings')
      .then((response) => response.json())
      .then((data) => {
        if (typeof data.requireAgentGhanaCardNumber === 'boolean') {
          setKyc({
            requireAgentGhanaCardNumber: data.requireAgentGhanaCardNumber,
            requireAgentGhanaCardUpload: data.requireAgentGhanaCardUpload ?? false,
          })
        }
      })
      .catch(() => {
        // Keep secure defaults if settings cannot be loaded.
      })
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  function validateStep(s: Step): string | null {
    if (s === 1) {
      if (!form.fullName.trim()) return 'Full name is required'
      if (!form.phone.trim()) return 'Phone number is required'
      if (!form.email.trim()) return 'Email address is required'
      if (form.password.length < 8) return 'Password must be at least 8 characters'
      if (form.password !== form.confirmPassword) return 'Passwords do not match'
    }
    if (s === 2) {
      if (!form.residentialAddress.trim()) return 'Residential address is required'
      if (kyc.requireAgentGhanaCardNumber && !form.ghanaCardNumber.trim()) {
        return 'Ghana Card Number is required'
      }
    }
    return null
  }

  function handleNext() {
    const err = validateStep(step)
    if (err) { setError(err); return }
    setError(null)
    setStep((s) => (s + 1) as Step)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const err = validateStep(3)
    if (err) { setError(err); return }

    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/agent/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          email: form.email,
          password: form.password,
          residentialAddress: form.residentialAddress,
          territory: form.territory,
          ghanaCardNumber: form.ghanaCardNumber,
          emergencyContactName: form.emergencyContactName,
          emergencyContactPhone: form.emergencyContactPhone,
        }),
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

  const steps = [
    { label: 'Account', icon: User },
    { label: 'Identity', icon: Shield },
    { label: 'Emergency', icon: Users },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-indigo-50 to-white px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Become an Agent</h1>
          <p className="text-gray-500 mt-1 text-sm">Register to start onboarding businesses</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {steps.map(({ label, icon: Icon }, i) => {
            const n = (i + 1) as Step
            const done = step > n
            const active = step === n
            return (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    done ? 'bg-indigo-600 text-white' : active ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {done ? '✓' : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-xs mt-1 font-medium ${active ? 'text-indigo-600' : done ? 'text-indigo-400' : 'text-gray-400'}`}>{label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-16 h-0.5 mx-2 mb-4 transition-all ${step > n ? 'bg-indigo-600' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>

        <div className="bg-white shadow-sm border border-gray-200 p-8">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100 mb-5">
              {error}
            </div>
          )}

          {/* Step 1 — Account details */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-500" /> Personal & Account Details
              </h2>

              <FormField label="Full Name" required icon={<User className="w-4 h-4" />}>
                <input
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="John Kwame Asante"
                  className={inputCls}
                />
              </FormField>

              <FormField label="Phone Number" required icon={<Phone className="w-4 h-4" />}>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+233 24 000 0000"
                  className={inputCls}
                />
              </FormField>

              <FormField label="Email Address" required icon={<Mail className="w-4 h-4" />}>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </FormField>

              <FormField label="Password" required icon={<Lock className="w-4 h-4" />}>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Minimum 8 characters"
                  className={inputCls}
                />
              </FormField>

              <FormField label="Confirm Password" required icon={<Lock className="w-4 h-4" />}>
                <input
                  type="password"
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="Re-enter your password"
                  className={inputCls}
                />
              </FormField>

              <button
                type="button"
                onClick={handleNext}
                className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors mt-2"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2 — Identity / KYC */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-500" /> Identity Verification
              </h2>

              <FormField
                label={
                  kyc.requireAgentGhanaCardNumber
                    ? 'Ghana Card Number'
                    : 'Ghana Card Number, if available'
                }
                required={kyc.requireAgentGhanaCardNumber}
                icon={<Shield className="w-4 h-4" />}
                helper={
                  kyc.requireAgentGhanaCardNumber
                    ? 'Your National ID number (GHA-XXXXXXXXX-X)'
                    : 'Optional at registration unless your card image is requested during review.'
                }
              >
                <input
                  name="ghanaCardNumber"
                  value={form.ghanaCardNumber}
                  onChange={handleChange}
                  placeholder={
                    kyc.requireAgentGhanaCardNumber
                      ? 'GHA-XXXXXXXXX-X'
                      : 'GHA-XXXXXXXXX-X (optional)'
                  }
                  className={inputCls}
                />
              </FormField>

              <FormField label="Residential Address" required icon={<MapPin className="w-4 h-4" />}>
                <input
                  name="residentialAddress"
                  value={form.residentialAddress}
                  onChange={handleChange}
                  placeholder="e.g. Kasoa, Central Region"
                  className={inputCls}
                />
              </FormField>

              <FormField label="Territory / Region" icon={<MapPin className="w-4 h-4" />}
                helper="The area you will be covering">
                <input
                  name="territory"
                  value={form.territory}
                  onChange={handleChange}
                  placeholder="e.g. Greater Accra"
                  className={inputCls}
                />
              </FormField>

              <div className="bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
                {kyc.requireAgentGhanaCardUpload
                  ? 'A Ghana Card image is required before approval. You will upload it from your profile page immediately after registration.'
                  : 'You can upload your Ghana Card image after registration from your profile page if the admin requests it.'}
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => { setError(null); setStep(1) }}
                  className="flex-1 py-2.5 border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Emergency contact */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" /> Emergency Contact
              </h2>
              <p className="text-xs text-gray-500 -mt-2 mb-3">
                Someone we can reach if we cannot contact you.
              </p>

              <FormField label="Emergency Contact Name" icon={<User className="w-4 h-4" />}>
                <input
                  name="emergencyContactName"
                  value={form.emergencyContactName}
                  onChange={handleChange}
                  placeholder="e.g. Abena Asante"
                  className={inputCls}
                />
              </FormField>

              <FormField label="Emergency Contact Phone" icon={<Phone className="w-4 h-4" />}>
                <input
                  name="emergencyContactPhone"
                  value={form.emergencyContactPhone}
                  onChange={handleChange}
                  placeholder="+233 20 000 0000"
                  className={inputCls}
                />
              </FormField>

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => { setError(null); setStep(2) }}
                  className="flex-1 py-2.5 border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>
              </div>
            </form>
          )}
        </div>

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

const inputCls =
  'w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

function FormField({
  label,
  required,
  helper,
  children,
  icon,
}: {
  label: string
  required?: boolean
  helper?: string
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {icon && <span className="inline-flex text-gray-400 mr-1.5 align-middle">{icon}</span>}
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {helper && <p className="text-xs text-gray-400 mt-1">{helper}</p>}
    </div>
  )
}
