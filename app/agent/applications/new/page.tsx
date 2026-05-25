'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Building2, User, Shield, Upload, Plus, Trash2, FileText, CheckCircle } from 'lucide-react'

interface KYCSettings {
  requireBusinessRegNumber: boolean
  requireBusinessCertUpload: boolean
  requireDirectorGhanaCardNumber: boolean
  requireDirectorGhanaCardUpload: boolean
}

type Step = 1 | 2 | 3 | 4

interface Director {
  fullName: string
  ghanaCardNumber: string
}

interface FormData {
  businessName: string
  businessType: string
  businessRegistrationNumber: string
  businessAddress: string
  businessPhone: string
  businessEmail: string
  ownerFullName: string
  ownerPhone: string
  ownerEmail: string
  ownerGhanaCardNumber: string
  directors: Director[]
}

export default function NewApplicationPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<FormData>({
    businessName: '',
    businessType: 'SHOP',
    businessRegistrationNumber: '',
    businessAddress: '',
    businessPhone: '',
    businessEmail: '',
    ownerFullName: '',
    ownerPhone: '',
    ownerEmail: '',
    ownerGhanaCardNumber: '',
    directors: [],
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [kyc, setKyc] = useState<KYCSettings>({
    requireBusinessRegNumber: false,
    requireBusinessCertUpload: false,
    requireDirectorGhanaCardNumber: true,
    requireDirectorGhanaCardUpload: false,
  })

  useEffect(() => {
    fetch('/api/agent/kyc-settings')
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.requireDirectorGhanaCardNumber === 'boolean') {
          setKyc({
            requireBusinessRegNumber: data.requireBusinessRegNumber ?? false,
            requireBusinessCertUpload: data.requireBusinessCertUpload ?? false,
            requireDirectorGhanaCardNumber: data.requireDirectorGhanaCardNumber ?? true,
            requireDirectorGhanaCardUpload: data.requireDirectorGhanaCardUpload ?? false,
          })
        }
      })
      .catch(() => { /* keep defaults */ })
  }, [])

  // Document upload state
  const [certFile, setCertFile] = useState<File | null>(null)
  const [ownerCardFile, setOwnerCardFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const certRef = useRef<HTMLInputElement>(null)
  const ownerCardRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  function addDirector() {
    setForm((prev) => ({
      ...prev,
      directors: [...prev.directors, { fullName: '', ghanaCardNumber: '' }],
    }))
  }

  function updateDirector(idx: number, field: keyof Director, value: string) {
    setForm((prev) => {
      const dirs = [...prev.directors]
      dirs[idx] = { ...dirs[idx], [field]: value }
      return { ...prev, directors: dirs }
    })
  }

  function removeDirector(idx: number) {
    setForm((prev) => ({
      ...prev,
      directors: prev.directors.filter((_, i) => i !== idx),
    }))
  }

  function validateStep(s: Step): string | null {
    if (s === 1) {
      if (!form.businessName.trim()) return 'Business name is required'
      if (!form.businessAddress.trim()) return 'Business location / address is required'
      if (kyc.requireBusinessRegNumber && !form.businessRegistrationNumber.trim()) {
        return 'Business Registration Number is required'
      }
    }
    if (s === 2) {
      if (!form.ownerFullName.trim()) return 'Director / owner full name is required'
      if (!form.ownerPhone.trim()) return 'Phone number is required'
      if (!form.ownerEmail.trim()) return 'Email address is required'
      if (kyc.requireDirectorGhanaCardNumber && !form.ownerGhanaCardNumber.trim()) {
        return 'Director Ghana Card Number is required'
      }
      if (
        kyc.requireDirectorGhanaCardNumber &&
        form.directors.some((director) => director.fullName.trim() && !director.ghanaCardNumber.trim())
      ) {
        return 'Every listed director must have a Ghana Card Number'
      }
    }
    if (s === 3) {
      if (kyc.requireBusinessCertUpload && !certFile) {
        return 'Business Certificate upload is required'
      }
      if (kyc.requireDirectorGhanaCardUpload && !ownerCardFile) {
        return 'Director Ghana Card upload is required'
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

  async function uploadDocuments(applicationId: string) {
    const uploads: { file: File; documentType: string; label: string }[] = []
    if (certFile) uploads.push({ file: certFile, documentType: 'BUSINESS_CERTIFICATE', label: 'Business Certificate' })
    if (ownerCardFile) uploads.push({ file: ownerCardFile, documentType: 'GHANA_CARD_FRONT', label: 'Director Ghana Card' })

    for (const u of uploads) {
      const fd = new FormData()
      fd.append('file', u.file)
      fd.append('documentType', u.documentType)
      fd.append('label', u.label)
      const response = await fetch(`/api/agent/applications/${applicationId}/upload-document`, {
        method: 'POST',
        body: fd,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed to upload ${u.label}`)
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const validationError = validateStep(3)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setLoading(true)

    try {
      const allDirectors = [
        { fullName: form.ownerFullName, ghanaCardNumber: form.ownerGhanaCardNumber },
        ...form.directors.filter((d) => d.fullName.trim()),
      ]

      const res = await fetch('/api/agent/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: form.businessName,
          businessType: form.businessType,
          businessRegistrationNumber: form.businessRegistrationNumber || undefined,
          businessAddress: form.businessAddress,
          businessPhone: form.businessPhone || undefined,
          businessEmail: form.businessEmail || undefined,
          ownerFullName: form.ownerFullName,
          ownerPhone: form.ownerPhone,
          ownerEmail: form.ownerEmail,
          ownerGhanaCardNumber: form.ownerGhanaCardNumber || undefined,
          directors: allDirectors,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Submission failed')
        setLoading(false)
        return
      }

      setCreatedId(data.id)

      // Upload documents if any were selected
      if (certFile || ownerCardFile) {
        setUploading(true)
        try {
          await uploadDocuments(data.id)
          router.push(`/agent/applications/${data.id}`)
          return
        } catch (uploadError) {
          const message =
            uploadError instanceof Error
              ? uploadError.message
              : 'One or more documents failed to upload.'
          setError(`${message} Your application was saved. Open it to retry the document upload.`)
        } finally {
          setUploading(false)
        }
        return
      }

      router.push(`/agent/applications/${data.id}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const steps = [
    { label: 'Business', icon: Building2 },
    { label: 'Directors', icon: User },
    { label: 'Documents', icon: FileText },
    { label: 'Review', icon: CheckCircle },
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/agent/applications"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Applications
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Business Application</h1>
        <p className="text-sm text-gray-500 mt-0.5">Onboard a shop or business as a new tenant</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {steps.map(({ label, icon: Icon }, i) => {
          const n = (i + 1) as Step
          const done = step > n
          const active = step === n
          return (
            <div key={label} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-8 h-8 -full flex items-center justify-center text-xs font-bold transition-all ${
                  done ? 'bg-indigo-600 text-white' : active ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {done ? '✓' : <Icon className="w-3.5 h-3.5" />}
                </div>
                <span className={`text-xs mt-1 font-medium hidden sm:block ${active ? 'text-indigo-600' : done ? 'text-indigo-400' : 'text-gray-400'}`}>{label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 mb-4 transition-all ${step > n ? 'bg-indigo-600' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">
          {error}
          {createdId && (
            <div className="mt-2">
              <Link href={`/agent/applications/${createdId}`} className="font-medium underline">
                Open saved application
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Step 1: Business Information ── */}
      {step === 1 && (
        <div className="bg-white border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-500" /> Business Information
          </h2>

          <Field label="Business Name" required>
            <input name="businessName" value={form.businessName} onChange={handleChange}
              placeholder="e.g. Ama's Provisions" className={inputCls} />
          </Field>

          <Field label="Business Type">
            <select name="businessType" value={form.businessType} onChange={handleChange} className={inputCls}>
              <option value="SHOP">Shop / Kiosk</option>
              <option value="COMPANY">Company / Enterprise</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>

          <Field
            label={kyc.requireBusinessRegNumber ? 'Business Registration Number' : 'Business Registration Number, if available'}
            required={kyc.requireBusinessRegNumber}
            helper={kyc.requireBusinessRegNumber ? undefined : 'Provide either the registration number or upload the certificate in the Documents step.'}
          >
            <input name="businessRegistrationNumber" value={form.businessRegistrationNumber}
              onChange={handleChange} placeholder={kyc.requireBusinessRegNumber ? 'e.g. CS-12345' : 'e.g. CS-12345 (optional)'} className={inputCls} />
          </Field>

          <Field label="Business Location / Address" required>
            <input name="businessAddress" value={form.businessAddress} onChange={handleChange}
              placeholder="e.g. Accra New Town, Greater Accra" className={inputCls} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Business Phone">
              <input name="businessPhone" value={form.businessPhone} onChange={handleChange}
                placeholder="+233 30 000 0000" className={inputCls} />
            </Field>
            <Field label="Business Email">
              <input type="email" name="businessEmail" value={form.businessEmail} onChange={handleChange}
                placeholder="business@example.com" className={inputCls} />
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            <button type="button" onClick={handleNext}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Directors / Owners ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-500" /> Primary Director / Owner
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <input name="ownerFullName" value={form.ownerFullName} onChange={handleChange}
                  placeholder="Ama Asante" className={inputCls} />
              </Field>
              <Field label="Phone" required>
                <input name="ownerPhone" value={form.ownerPhone} onChange={handleChange}
                  placeholder="+233 24 000 0000" className={inputCls} />
              </Field>
              <Field label="Email" required>
                <input type="email" name="ownerEmail" value={form.ownerEmail} onChange={handleChange}
                  placeholder="owner@example.com" className={inputCls} />
              </Field>
              <Field
                label={kyc.requireDirectorGhanaCardNumber ? 'Ghana Card Number' : 'Director Ghana Card Number'}
                required={kyc.requireDirectorGhanaCardNumber}
                helper={kyc.requireDirectorGhanaCardNumber ? undefined : 'Provide either the Ghana Card number or upload the Ghana Card image in the next step.'}
              >
                <input name="ownerGhanaCardNumber" value={form.ownerGhanaCardNumber} onChange={handleChange}
                  placeholder="GHA-XXXXXXXXX-X" className={inputCls} />
              </Field>
            </div>
          </div>

          {/* Additional directors */}
          {form.directors.length > 0 && (
            <div className="bg-white border border-gray-200 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Additional Directors</h2>
              {form.directors.map((d, i) => (
                <div key={i} className="flex gap-3 items-start border border-gray-100 p-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      value={d.fullName}
                      onChange={(e) => updateDirector(i, 'fullName', e.target.value)}
                      placeholder="Full Name"
                      className={inputCls}
                    />
                    <input
                      value={d.ghanaCardNumber}
                      onChange={(e) => updateDirector(i, 'ghanaCardNumber', e.target.value)}
                      placeholder={
                        kyc.requireDirectorGhanaCardNumber
                          ? 'Ghana Card Number'
                          : 'Ghana Card Number (optional)'
                      }
                      className={inputCls}
                    />
                  </div>
                  <button type="button" onClick={() => removeDirector(i)}
                    className="mt-2 p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={addDirector}
            className="flex items-center gap-2 text-sm text-indigo-600 font-medium hover:text-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Add another director
          </button>

          <div className="flex justify-between gap-3 pt-2">
            <button type="button" onClick={() => { setError(null); setStep(1) }}
              className="px-5 py-2.5 border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors">
              Back
            </button>
            <button type="button" onClick={handleNext}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Documents ── */}
      {step === 3 && (
        <div className="bg-white border border-gray-200 p-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" /> Supporting Documents
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Uploading documents speeds up approval. You can always skip this and submit now.
            </p>
          </div>

          <DocUploadField
            label={
              kyc.requireBusinessCertUpload
                ? 'Upload Business Certificate'
                : 'Upload Business Certificate, if available'
            }
            helper={
              kyc.requireBusinessCertUpload
                ? 'Required by the current KYC settings.'
                : 'Upload a certificate of registration or any official business document.'
            }
            accept="image/*,.pdf"
            file={certFile}
            inputRef={certRef}
            onChange={(f) => setCertFile(f)}
          />

          <DocUploadField
            label={
              kyc.requireDirectorGhanaCardUpload
                ? 'Upload Director Ghana Card'
                : 'Upload Director Ghana Card, optional if number is provided'
            }
            helper={
              kyc.requireDirectorGhanaCardUpload
                ? 'Required by the current KYC settings.'
                : 'A clear photo or scan of the front of the Ghana Card.'
            }
            accept="image/*"
            file={ownerCardFile}
            inputRef={ownerCardRef}
            onChange={(f) => setOwnerCardFile(f)}
          />

          <div className="bg-amber-50 border border-amber-100 p-3 text-xs text-amber-700">
            <strong>Tip:</strong>{' '}
            {kyc.requireBusinessCertUpload || kyc.requireDirectorGhanaCardUpload
              ? 'The current KYC settings require the uploads marked above before this application can move forward.'
              : 'Providing either the registration number or the certificate, and either the Ghana Card number or the Ghana Card image, is sufficient for submission.'}
          </div>

          <div className="flex justify-between gap-3">
            <button type="button" onClick={() => { setError(null); setStep(2) }}
              className="px-5 py-2.5 border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors">
              Back
            </button>
            <button type="button" onClick={handleNext}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
              Review & Submit
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Review & Submit ── */}
      {step === 4 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white border border-gray-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-indigo-500" /> Review Details
            </h2>

            <ReviewSection title="Business">
              <Row label="Name" value={form.businessName} />
              <Row label="Type" value={{ SHOP: 'Shop / Kiosk', COMPANY: 'Company / Enterprise', OTHER: 'Other' }[form.businessType] ?? form.businessType} />
              <Row label="Address" value={form.businessAddress} />
              {form.businessRegistrationNumber && <Row label="Reg. Number" value={form.businessRegistrationNumber} />}
              {form.businessPhone && <Row label="Phone" value={form.businessPhone} />}
              {form.businessEmail && <Row label="Email" value={form.businessEmail} />}
            </ReviewSection>

            <ReviewSection title="Primary Director">
              <Row label="Name" value={form.ownerFullName} />
              <Row label="Phone" value={form.ownerPhone} />
              <Row label="Email" value={form.ownerEmail} />
              {form.ownerGhanaCardNumber && <Row label="Ghana Card" value={form.ownerGhanaCardNumber} />}
            </ReviewSection>

            {form.directors.filter((d) => d.fullName.trim()).length > 0 && (
              <ReviewSection title="Additional Directors">
                {form.directors.filter((d) => d.fullName.trim()).map((d, i) => (
                  <Row key={i} label={`Director ${i + 2}`} value={`${d.fullName}${d.ghanaCardNumber ? ` · ${d.ghanaCardNumber}` : ''}`} />
                ))}
              </ReviewSection>
            )}

            <ReviewSection title="Documents">
              <Row label="Business Certificate" value={certFile ? certFile.name : 'Not uploaded (optional)'} dim={!certFile} />
              <Row label="Director Ghana Card" value={ownerCardFile ? ownerCardFile.name : 'Not uploaded (optional)'} dim={!ownerCardFile} />
            </ReviewSection>
          </div>

          <div className="flex justify-between gap-3">
            <button type="button" onClick={() => { setError(null); setStep(3) }}
              className="px-5 py-2.5 border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors">
              Back
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {uploading ? 'Uploading documents…' : loading ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const inputCls =
  'w-full px-3.5 py-2.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string
  required?: boolean
  helper?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {helper && <p className="text-xs text-gray-400 mt-1">{helper}</p>}
    </div>
  )
}

function DocUploadField({
  label,
  helper,
  accept,
  file,
  inputRef,
  onChange,
}: {
  label: string
  helper: string
  accept: string
  file: File | null
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (f: File | null) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <p className="text-xs text-gray-400 mb-2">{helper}</p>
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
        >
          <Upload className="w-4 h-4 text-gray-400" />
          {file ? 'Change file' : 'Choose file'}
        </button>
        {file && (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle className="w-4 h-4" />
            <span className="truncate max-w-xs">{file.name}</span>
            <button type="button" onClick={() => onChange(null)}
              className="text-gray-400 hover:text-red-500 ml-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex justify-between text-sm gap-4">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={`font-medium text-right ${dim ? 'text-gray-300' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}
