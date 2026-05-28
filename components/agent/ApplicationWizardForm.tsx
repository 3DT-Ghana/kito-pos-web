'use client'

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  CheckCircle,
  ChevronLeft,
  FileText,
  Plus,
  Trash2,
  Upload,
  User,
  XCircle,
} from 'lucide-react'

interface KYCSettings {
  requireBusinessRegNumber: boolean
  requireBusinessCertUpload: boolean
  requireDirectorGhanaCardNumber: boolean
  requireDirectorGhanaCardUpload: boolean
}

type Step = 1 | 2 | 3 | 4
type FormMode = 'create' | 'edit'

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

interface ExistingDocument {
  id: string
  documentType: string
  label: string | null
  fileUrl: string
  uploadedAt: string
}

interface ExistingApplication {
  id: string
  businessName: string
  businessType: string
  businessRegistrationNumber: string | null
  businessAddress: string
  businessPhone: string | null
  businessEmail: string | null
  ownerFullName: string
  ownerPhone: string
  ownerEmail: string
  ownerGhanaCardNumber: string | null
  directors: Director[]
  status: string
  rejectionReason: string | null
  documents: ExistingDocument[]
}

interface ApplicationWizardFormProps {
  applicationId?: string
  mode: FormMode
}

const emptyForm: FormData = {
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
}

export function ApplicationWizardForm({
  applicationId,
  mode,
}: ApplicationWizardFormProps) {
  const router = useRouter()
  const isEditMode = mode === 'edit'
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(isEditMode)
  const [savedApplicationId, setSavedApplicationId] = useState<string | null>(null)
  const [existingApplication, setExistingApplication] =
    useState<ExistingApplication | null>(null)
  const [kyc, setKyc] = useState<KYCSettings>({
    requireBusinessRegNumber: false,
    requireBusinessCertUpload: false,
    requireDirectorGhanaCardNumber: true,
    requireDirectorGhanaCardUpload: false,
  })

  const [certFile, setCertFile] = useState<File | null>(null)
  const [ownerCardFile, setOwnerCardFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const certRef = useRef<HTMLInputElement>(null)
  const ownerCardRef = useRef<HTMLInputElement>(null)

  const existingDocuments = existingApplication?.documents ?? []
  const hasExistingBusinessCertificate = existingDocuments.some(
    (document) => document.documentType === 'BUSINESS_CERTIFICATE'
  )
  const hasExistingDirectorCard = existingDocuments.some(
    (document) => document.documentType === 'GHANA_CARD_FRONT'
  )

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      try {
        const kycPromise = fetch('/api/agent/kyc-settings')
          .then((response) => response.json())
          .then((data) => {
            if (
              data &&
              typeof data.requireDirectorGhanaCardNumber === 'boolean' &&
              !cancelled
            ) {
              setKyc({
                requireBusinessRegNumber: data.requireBusinessRegNumber ?? false,
                requireBusinessCertUpload: data.requireBusinessCertUpload ?? false,
                requireDirectorGhanaCardNumber:
                  data.requireDirectorGhanaCardNumber ?? true,
                requireDirectorGhanaCardUpload:
                  data.requireDirectorGhanaCardUpload ?? false,
              })
            }
          })

        if (!isEditMode || !applicationId) {
          await kycPromise
          return
        }

        const applicationPromise = fetch(`/api/agent/applications/${applicationId}`)
          .then((response) => response.json())
          .then((data) => {
            if (cancelled) {
              return
            }

            if (data.error) {
              throw new Error(data.error)
            }

            if (data.status !== 'REJECTED') {
              throw new Error(
                'Only rejected applications can be edited from the agent portal'
              )
            }

            const directors = Array.isArray(data.directors) ? data.directors : []
            const additionalDirectors = directors.filter((director: Director) => {
              const directorName = director.fullName?.trim().toLowerCase()
              const ownerName = String(data.ownerFullName ?? '')
                .trim()
                .toLowerCase()
              return directorName && directorName !== ownerName
            })

            setExistingApplication(data)
            setForm({
              businessName: data.businessName ?? '',
              businessType: data.businessType ?? 'SHOP',
              businessRegistrationNumber: data.businessRegistrationNumber ?? '',
              businessAddress: data.businessAddress ?? '',
              businessPhone: data.businessPhone ?? '',
              businessEmail: data.businessEmail ?? '',
              ownerFullName: data.ownerFullName ?? '',
              ownerPhone: data.ownerPhone ?? '',
              ownerEmail: data.ownerEmail ?? '',
              ownerGhanaCardNumber: data.ownerGhanaCardNumber ?? '',
              directors: additionalDirectors.map((director: Director) => ({
                fullName: director.fullName ?? '',
                ghanaCardNumber: director.ghanaCardNumber ?? '',
              })),
            })
          })

        await Promise.all([kycPromise, applicationPromise])
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load application'
          )
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false)
        }
      }
    }

    void loadInitialData()

    return () => {
      cancelled = true
    }
  }, [applicationId, isEditMode])

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
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
      const directors = [...prev.directors]
      directors[idx] = { ...directors[idx], [field]: value }
      return { ...prev, directors }
    })
  }

  function removeDirector(idx: number) {
    setForm((prev) => ({
      ...prev,
      directors: prev.directors.filter((_, i) => i !== idx),
    }))
  }

  function validateStep(currentStep: Step): string | null {
    if (currentStep === 1) {
      if (!form.businessName.trim()) return 'Business name is required'
      if (!form.businessAddress.trim()) {
        return 'Business location / address is required'
      }
      if (
        kyc.requireBusinessRegNumber &&
        !form.businessRegistrationNumber.trim()
      ) {
        return 'Business Registration Number is required'
      }
    }

    if (currentStep === 2) {
      if (!form.ownerFullName.trim()) {
        return 'Director / owner full name is required'
      }
      if (!form.ownerPhone.trim()) return 'Phone number is required'
      if (!form.ownerEmail.trim()) return 'Email address is required'
      if (
        kyc.requireDirectorGhanaCardNumber &&
        !form.ownerGhanaCardNumber.trim()
      ) {
        return 'Director Ghana Card Number is required'
      }
      if (
        kyc.requireDirectorGhanaCardNumber &&
        form.directors.some(
          (director) =>
            director.fullName.trim() && !director.ghanaCardNumber.trim()
        )
      ) {
        return 'Every listed director must have a Ghana Card Number'
      }
    }

    if (currentStep === 3) {
      if (
        kyc.requireBusinessCertUpload &&
        !certFile &&
        !hasExistingBusinessCertificate
      ) {
        return 'Business Certificate upload is required'
      }
      if (
        kyc.requireDirectorGhanaCardUpload &&
        !ownerCardFile &&
        !hasExistingDirectorCard
      ) {
        return 'Director Ghana Card upload is required'
      }
    }

    return null
  }

  function handleNext() {
    const validationError = validateStep(step)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setStep((current) => (current + 1) as Step)
  }

  async function uploadDocuments(targetApplicationId: string) {
    const uploads: Array<{ file: File; documentType: string; label: string }> = []

    if (certFile) {
      uploads.push({
        file: certFile,
        documentType: 'BUSINESS_CERTIFICATE',
        label: 'Business Certificate',
      })
    }

    if (ownerCardFile) {
      uploads.push({
        file: ownerCardFile,
        documentType: 'GHANA_CARD_FRONT',
        label: 'Director Ghana Card',
      })
    }

    for (const upload of uploads) {
      const formData = new FormData()
      formData.append('file', upload.file)
      formData.append('documentType', upload.documentType)
      formData.append('label', upload.label)

      const response = await fetch(
        `/api/agent/applications/${targetApplicationId}/upload-document`,
        {
          method: 'POST',
          body: formData,
        }
      )

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed to upload ${upload.label}`)
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
        {
          fullName: form.ownerFullName,
          ghanaCardNumber: form.ownerGhanaCardNumber,
        },
        ...form.directors.filter((director) => director.fullName.trim()),
      ]

      const targetUrl = isEditMode
        ? `/api/agent/applications/${applicationId}`
        : '/api/agent/applications'
      const method = isEditMode ? 'PUT' : 'POST'

      const response = await fetch(targetUrl, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: form.businessName,
          businessType: form.businessType,
          businessRegistrationNumber:
            form.businessRegistrationNumber || undefined,
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

      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Submission failed')
        setLoading(false)
        return
      }

      const targetApplicationId = data.id as string
      setSavedApplicationId(targetApplicationId)

      if (certFile || ownerCardFile) {
        setUploading(true)
        try {
          await uploadDocuments(targetApplicationId)
          router.push(`/agent/applications/${targetApplicationId}`)
          return
        } catch (uploadError) {
          const message =
            uploadError instanceof Error
              ? uploadError.message
              : 'One or more documents failed to upload.'
          setError(
            `${message} ${
              isEditMode
                ? 'Your application was updated and resubmitted.'
                : 'Your application was saved.'
            } Open it to retry the document upload.`
          )
        } finally {
          setUploading(false)
        }

        return
      }

      router.push(`/agent/applications/${targetApplicationId}`)
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

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (isEditMode && (!applicationId || !existingApplication) && error) {
    return (
      <div className="max-w-2xl mx-auto">
        <Link
          href="/agent/applications"
          className="mb-6 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Applications
        </Link>
        <div className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    )
  }

  const title = isEditMode
    ? `Edit ${existingApplication?.businessName ?? 'Rejected Application'}`
    : 'New Business Application'
  const description = isEditMode
    ? 'Correct the rejected registration and resubmit it for review.'
    : 'Onboard a shop or business as a new tenant'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href={isEditMode && applicationId ? `/agent/applications/${applicationId}` : '/agent/applications'}
          className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          {isEditMode ? 'Back to Application' : 'Back to Applications'}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>

      {isEditMode && existingApplication?.rejectionReason && (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Previous rejection reason</p>
              <p className="mt-1">{existingApplication.rejectionReason}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-0">
        {steps.map(({ label, icon: Icon }, index) => {
          const current = (index + 1) as Step
          const done = step > current
          const active = step === current

          return (
            <div key={label} className="flex flex-1 items-center">
              <div className="flex flex-1 flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    done
                      ? 'bg-indigo-600 text-white'
                      : active
                        ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {done ? '✓' : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span
                  className={`mt-1 hidden text-xs font-medium sm:block ${
                    active
                      ? 'text-indigo-600'
                      : done
                        ? 'text-indigo-400'
                        : 'text-gray-400'
                  }`}
                >
                  {label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-1 mb-4 h-0.5 flex-1 transition-all ${
                    step > current ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          {savedApplicationId && (
            <div className="mt-2">
              <Link
                href={`/agent/applications/${savedApplicationId}`}
                className="font-medium underline"
              >
                Open saved application
              </Link>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4 border border-gray-200 bg-white p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Building2 className="h-4 w-4 text-indigo-500" />
            Business Information
          </h2>

          <Field label="Business Name" required>
            <input
              name="businessName"
              value={form.businessName}
              onChange={handleChange}
              placeholder="e.g. Ama's Provisions"
              className={inputCls}
            />
          </Field>

          <Field label="Business Type">
            <select
              name="businessType"
              value={form.businessType}
              onChange={handleChange}
              className={inputCls}
            >
              <option value="SHOP">Shop / Kiosk</option>
              <option value="COMPANY">Company / Enterprise</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>

          <Field
            label={
              kyc.requireBusinessRegNumber
                ? 'Business Registration Number'
                : 'Business Registration Number, if available'
            }
            required={kyc.requireBusinessRegNumber}
            helper={
              kyc.requireBusinessRegNumber
                ? undefined
                : 'Provide either the registration number or upload the certificate in the Documents step.'
            }
          >
            <input
              name="businessRegistrationNumber"
              value={form.businessRegistrationNumber}
              onChange={handleChange}
              placeholder={
                kyc.requireBusinessRegNumber
                  ? 'e.g. CS-12345'
                  : 'e.g. CS-12345 (optional)'
              }
              className={inputCls}
            />
          </Field>

          <Field label="Business Location / Address" required>
            <input
              name="businessAddress"
              value={form.businessAddress}
              onChange={handleChange}
              placeholder="e.g. Accra New Town, Greater Accra"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Business Phone">
              <input
                name="businessPhone"
                value={form.businessPhone}
                onChange={handleChange}
                placeholder="+233 30 000 0000"
                className={inputCls}
              />
            </Field>
            <Field label="Business Email">
              <input
                type="email"
                name="businessEmail"
                value={form.businessEmail}
                onChange={handleChange}
                placeholder="business@example.com"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleNext}
              className="bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-4 border border-gray-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <User className="h-4 w-4 text-indigo-500" />
              Primary Director / Owner
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full Name" required>
                <input
                  name="ownerFullName"
                  value={form.ownerFullName}
                  onChange={handleChange}
                  placeholder="Ama Asante"
                  className={inputCls}
                />
              </Field>
              <Field label="Phone" required>
                <input
                  name="ownerPhone"
                  value={form.ownerPhone}
                  onChange={handleChange}
                  placeholder="+233 24 000 0000"
                  className={inputCls}
                />
              </Field>
              <Field label="Email" required>
                <input
                  type="email"
                  name="ownerEmail"
                  value={form.ownerEmail}
                  onChange={handleChange}
                  placeholder="owner@example.com"
                  className={inputCls}
                />
              </Field>
              <Field
                label={
                  kyc.requireDirectorGhanaCardNumber
                    ? 'Ghana Card Number'
                    : 'Director Ghana Card Number'
                }
                required={kyc.requireDirectorGhanaCardNumber}
                helper={
                  kyc.requireDirectorGhanaCardNumber
                    ? undefined
                    : 'Provide either the Ghana Card number or upload the Ghana Card image in the next step.'
                }
              >
                <input
                  name="ownerGhanaCardNumber"
                  value={form.ownerGhanaCardNumber}
                  onChange={handleChange}
                  placeholder="GHA-XXXXXXXXX-X"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          {form.directors.length > 0 && (
            <div className="space-y-4 border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-gray-800">
                Additional Directors
              </h2>
              {form.directors.map((director, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 border border-gray-100 p-3"
                >
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      value={director.fullName}
                      onChange={(e) =>
                        updateDirector(index, 'fullName', e.target.value)
                      }
                      placeholder="Full Name"
                      className={inputCls}
                    />
                    <input
                      value={director.ghanaCardNumber}
                      onChange={(e) =>
                        updateDirector(index, 'ghanaCardNumber', e.target.value)
                      }
                      placeholder={
                        kyc.requireDirectorGhanaCardNumber
                          ? 'Ghana Card Number'
                          : 'Ghana Card Number (optional)'
                      }
                      className={inputCls}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDirector(index)}
                    className="mt-2 p-1.5 text-gray-400 transition-colors hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addDirector}
            className="flex items-center gap-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add another director
          </button>

          <div className="flex justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setError(null)
                setStep(1)
              }}
              className="border border-gray-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 border border-gray-200 bg-white p-6">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <FileText className="h-4 w-4 text-indigo-500" />
              Supporting Documents
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              Uploading documents speeds up approval. You can always skip this and
              submit now.
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
            existingLabel={
              hasExistingBusinessCertificate
                ? 'A business certificate is already on file. Upload a new one to replace it.'
                : undefined
            }
            accept="image/*,.pdf"
            file={certFile}
            inputRef={certRef}
            onChange={setCertFile}
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
            existingLabel={
              hasExistingDirectorCard
                ? 'A director Ghana Card is already on file. Upload a new one to replace it.'
                : undefined
            }
            accept="image/*"
            file={ownerCardFile}
            inputRef={ownerCardRef}
            onChange={setOwnerCardFile}
          />

          <div className="border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700">
            <strong>Tip:</strong>{' '}
            {kyc.requireBusinessCertUpload || kyc.requireDirectorGhanaCardUpload
              ? 'The current KYC settings require the uploads marked above before this application can move forward.'
              : 'Providing either the registration number or the certificate, and either the Ghana Card number or the Ghana Card image, is sufficient for submission.'}
          </div>

          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null)
                setStep(2)
              }}
              className="border border-gray-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Review & Submit
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3 border border-gray-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <CheckCircle className="h-4 w-4 text-indigo-500" />
              Review Details
            </h2>

            <ReviewSection title="Business">
              <Row label="Name" value={form.businessName} />
              <Row
                label="Type"
                value={
                  {
                    SHOP: 'Shop / Kiosk',
                    COMPANY: 'Company / Enterprise',
                    OTHER: 'Other',
                  }[form.businessType] ?? form.businessType
                }
              />
              <Row label="Address" value={form.businessAddress} />
              {form.businessRegistrationNumber && (
                <Row
                  label="Reg. Number"
                  value={form.businessRegistrationNumber}
                />
              )}
              {form.businessPhone && <Row label="Phone" value={form.businessPhone} />}
              {form.businessEmail && <Row label="Email" value={form.businessEmail} />}
            </ReviewSection>

            <ReviewSection title="Primary Director">
              <Row label="Name" value={form.ownerFullName} />
              <Row label="Phone" value={form.ownerPhone} />
              <Row label="Email" value={form.ownerEmail} />
              {form.ownerGhanaCardNumber && (
                <Row label="Ghana Card" value={form.ownerGhanaCardNumber} />
              )}
            </ReviewSection>

            {form.directors.filter((director) => director.fullName.trim()).length >
              0 && (
              <ReviewSection title="Additional Directors">
                {form.directors
                  .filter((director) => director.fullName.trim())
                  .map((director, index) => (
                    <Row
                      key={index}
                      label={`Director ${index + 2}`}
                      value={`${director.fullName}${
                        director.ghanaCardNumber
                          ? ` · ${director.ghanaCardNumber}`
                          : ''
                      }`}
                    />
                  ))}
              </ReviewSection>
            )}

            <ReviewSection title="Documents">
              <Row
                label="Business Certificate"
                value={
                  certFile
                    ? certFile.name
                    : hasExistingBusinessCertificate
                      ? 'Already on file'
                      : 'Not uploaded (optional)'
                }
                dim={!certFile && !hasExistingBusinessCertificate}
              />
              <Row
                label="Director Ghana Card"
                value={
                  ownerCardFile
                    ? ownerCardFile.name
                    : hasExistingDirectorCard
                      ? 'Already on file'
                      : 'Not uploaded (optional)'
                }
                dim={!ownerCardFile && !hasExistingDirectorCard}
              />
            </ReviewSection>
          </div>

          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null)
                setStep(3)
              }}
              className="border border-gray-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {uploading
                ? 'Uploading documents…'
                : loading
                  ? isEditMode
                    ? 'Resubmitting…'
                    : 'Submitting…'
                  : isEditMode
                    ? 'Save & Resubmit'
                    : 'Submit Application'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const inputCls =
  'w-full border border-gray-300 px-3.5 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500'

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string
  required?: boolean
  helper?: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {helper && <p className="mt-1 text-xs text-gray-400">{helper}</p>}
    </div>
  )
}

function DocUploadField({
  label,
  helper,
  existingLabel,
  accept,
  file,
  inputRef,
  onChange,
}: {
  label: string
  helper: string
  existingLabel?: string
  accept: string
  file: File | null
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (file: File | null) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <p className="mb-2 text-xs text-gray-400">{helper}</p>
      {existingLabel && (
        <p className="mb-2 text-xs text-emerald-700">{existingLabel}</p>
      )}
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
          className="flex items-center gap-2 border border-gray-300 px-4 py-2 text-sm transition-colors hover:bg-gray-50"
        >
          <Upload className="h-4 w-4 text-gray-400" />
          {file ? 'Change file' : 'Choose file'}
        </button>
        {file && (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle className="h-4 w-4" />
            <span className="max-w-xs truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-1 text-gray-400 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  dim,
}: {
  label: string
  value: string
  dim?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span
        className={`text-right font-medium ${
          dim ? 'text-gray-300' : 'text-gray-900'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
