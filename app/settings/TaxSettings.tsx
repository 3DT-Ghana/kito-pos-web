'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Percent, Receipt, TriangleAlert, X } from 'lucide-react'

interface TaxSettingsProps {
  tenantId: string
  enableAccounting: boolean
}

interface TenantTaxSetting {
  taxEnabled: boolean
  defaultTaxCalculationType: 'ADD_TO_PRICE' | 'INCLUSIVE'
}

interface TaxRateRecord {
  id: string
  name: string
  ratePercentage: number
  description: string | null
  isDefault: boolean
  isActive: boolean
  effectiveFrom: string
  effectiveTo: string | null
  taxPayableAccountId: string | null
  taxPayableAccount?: {
    id: string
    code: string
    name: string
  } | null
}

interface LiabilityAccount {
  id: string
  code: string
  name: string
}

interface TaxRateFormState {
  name: string
  ratePercentage: string
  description: string
  isDefault: boolean
  isActive: boolean
  effectiveFrom: string
  effectiveTo: string
  taxPayableAccountId: string
}

interface FormErrors {
  name?: string
  ratePercentage?: string
  effectiveTo?: string
}

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-3 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        checked ? 'border-blue-600 bg-blue-600' : 'border-gray-200 bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-full w-7 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
          checked ? 'translate-x-8' : 'translate-x-0'
        }`}
      >
        {checked && <Check className="h-full w-full p-1 text-blue-600" />}
      </span>
    </button>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="border-2 border-gray-200 bg-white p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-14 w-14 bg-gray-200" />
          <div className="space-y-2">
            <div className="h-6 w-40 rounded bg-gray-200" />
            <div className="h-4 w-64 rounded bg-gray-100" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-20 bg-gray-100" />
          <div className="h-16 bg-gray-100" />
          <div className="h-16 bg-gray-100" />
        </div>
      </div>
      <div className="border-2 border-gray-200 bg-white p-6">
        <div className="mb-4 h-6 w-32 rounded bg-gray-200" />
        <div className="space-y-3">
          <div className="h-24 bg-gray-100" />
          <div className="h-24 bg-gray-100" />
        </div>
      </div>
    </div>
  )
}

function todayDateInput() {
  return new Date().toISOString().split('T')[0]
}

function emptyTaxRateForm(): TaxRateFormState {
  return {
    name: '',
    ratePercentage: '',
    description: '',
    isDefault: false,
    isActive: true,
    effectiveFrom: todayDateInput(),
    effectiveTo: '',
    taxPayableAccountId: '',
  }
}

function toDateInput(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toISOString().split('T')[0]
}

function formatDateDisplay(value: string | null | undefined) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function validateForm(form: TaxRateFormState): FormErrors {
  const errors: FormErrors = {}
  if (!form.name.trim()) errors.name = 'Tax name is required.'
  const pct = Number(form.ratePercentage)
  if (form.ratePercentage === '' || isNaN(pct) || pct < 0 || pct > 100) {
    errors.ratePercentage = 'Enter a percentage between 0 and 100.'
  }
  if (form.effectiveTo && form.effectiveFrom && form.effectiveTo < form.effectiveFrom) {
    errors.effectiveTo = '"Effective To" must be after "Effective From".'
  }
  return errors
}

export function TaxSettings({ tenantId, enableAccounting }: TaxSettingsProps) {
  const [taxSetting, setTaxSetting] = useState<TenantTaxSetting>({
    taxEnabled: false,
    defaultTaxCalculationType: 'ADD_TO_PRICE',
  })
  const [taxRates, setTaxRates] = useState<TaxRateRecord[]>([])
  const [liabilityAccounts, setLiabilityAccounts] = useState<LiabilityAccount[]>([])
  const [taxRateForm, setTaxRateForm] = useState<TaxRateFormState>(emptyTaxRateForm())
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [editingTaxRateId, setEditingTaxRateId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [rateSaving, setRateSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingsMessage, setSettingsMessage] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [rateMessage, setRateMessage] = useState('')
  const [rateError, setRateError] = useState('')

  const formRef = useRef<HTMLDivElement>(null)

  const defaultTaxes = useMemo(
    () => taxRates.filter((rate) => rate.isDefault && rate.isActive),
    [taxRates]
  )

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      setSettingsError('')

      const requests: Promise<Response>[] = [
        fetch('/api/tax/settings'),
        fetch('/api/tax/rates'),
      ]

      if (enableAccounting) {
        requests.push(fetch('/api/accounting/accounts?type=LIABILITY&activeOnly=true'))
      }

      const [taxSettingRes, taxRatesRes, liabilityRes] = await Promise.all(requests)

      if (!taxSettingRes.ok || !taxRatesRes.ok) {
        throw new Error('Failed to load tax settings')
      }

      const taxSettingData = await taxSettingRes.json()
      const taxRatesData = await taxRatesRes.json()

      setTaxSetting(taxSettingData.taxSetting)
      setTaxRates(taxRatesData.taxRates ?? [])

      if (enableAccounting && liabilityRes?.ok) {
        const liabilityData = await liabilityRes.json()
        setLiabilityAccounts(liabilityData.accounts ?? [])
      } else {
        setLiabilityAccounts([])
      }
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to load tax settings')
    } finally {
      setIsLoading(false)
    }
  }, [enableAccounting])

  useEffect(() => {
    loadData()
  }, [loadData, tenantId])

  const updateRateForm = <K extends keyof TaxRateFormState>(
    key: K,
    value: TaxRateFormState[K]
  ) => {
    setTaxRateForm((current) => ({ ...current, [key]: value }))
    if (formErrors[key as keyof FormErrors]) {
      setFormErrors((current) => ({ ...current, [key]: undefined }))
    }
  }

  const resetRateForm = () => {
    setEditingTaxRateId(null)
    setTaxRateForm(emptyTaxRateForm())
    setFormErrors({})
    setRateError('')
    setRateMessage('')
  }

  const editTaxRate = (rate: TaxRateRecord) => {
    setEditingTaxRateId(rate.id)
    setTaxRateForm({
      name: rate.name,
      ratePercentage: String(rate.ratePercentage),
      description: rate.description ?? '',
      isDefault: rate.isDefault,
      isActive: rate.isActive,
      effectiveFrom: toDateInput(rate.effectiveFrom),
      effectiveTo: toDateInput(rate.effectiveTo),
      taxPayableAccountId: rate.taxPayableAccountId ?? '',
    })
    setFormErrors({})
    setRateError('')
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const saveSettings = async () => {
    try {
      setSettingsSaving(true)
      setSettingsError('')
      setSettingsMessage('')

      const response = await fetch('/api/tax/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taxSetting),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save tax settings')
      }

      setTaxSetting(payload.taxSetting)
      setSettingsMessage('Tax settings saved.')
      setTimeout(() => setSettingsMessage(''), 3000)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save tax settings')
    } finally {
      setSettingsSaving(false)
    }
  }

  const saveTaxRate = async () => {
    const errors = validateForm(taxRateForm)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    try {
      setRateSaving(true)
      setRateError('')
      setRateMessage('')

      const endpoint = editingTaxRateId
        ? `/api/tax/rates/${editingTaxRateId}`
        : '/api/tax/rates'
      const method = editingTaxRateId ? 'PUT' : 'POST'

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: taxRateForm.name.trim(),
          ratePercentage: Number(taxRateForm.ratePercentage),
          description: taxRateForm.description.trim() || null,
          isDefault: taxRateForm.isDefault,
          isActive: taxRateForm.isActive,
          effectiveFrom: taxRateForm.effectiveFrom || null,
          effectiveTo: taxRateForm.effectiveTo || null,
          taxPayableAccountId: taxRateForm.taxPayableAccountId || null,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save tax rate')
      }

      setRateMessage(editingTaxRateId ? 'Tax rate updated.' : 'Tax rate created.')
      resetRateForm()
      await loadData()
      setTimeout(() => setRateMessage(''), 3000)
    } catch (err) {
      setRateError(err instanceof Error ? err.message : 'Failed to save tax rate')
    } finally {
      setRateSaving(false)
    }
  }

  const toggleActiveState = async (rate: TaxRateRecord) => {
    try {
      setTogglingId(rate.id)
      setRateError('')
      const response = await fetch(`/api/tax/rates/${rate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rate.isActive }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update tax rate status')
      }
      await loadData()
    } catch (err) {
      setRateError(err instanceof Error ? err.message : 'Failed to update tax rate status')
    } finally {
      setTogglingId(null)
    }
  }

  const confirmDelete = async (rate: TaxRateRecord) => {
    try {
      setDeletingId(rate.id)
      setRateError('')
      setRateMessage('')
      const response = await fetch(`/api/tax/rates/${rate.id}`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete tax rate')
      }

      setPendingDeleteId(null)
      await loadData()
      setRateMessage('Tax rate deleted.')
      setTimeout(() => setRateMessage(''), 3000)
    } catch (err) {
      setRateError(err instanceof Error ? err.message : 'Failed to delete tax rate')
      setPendingDeleteId(null)
    } finally {
      setDeletingId(null)
    }
  }

  if (isLoading) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      {/* Global Tax Settings */}
      <div className="border-2 border-gray-200 bg-white p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-emerald-100 p-3">
            <Receipt className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Tax Settings</h2>
            <p className="text-sm text-gray-600">
              Enable tenant-level tax, choose how prices behave, and manage default tax rules.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="border-2 border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <label htmlFor="taxEnabled" className="text-base font-bold text-gray-900">
                  Enable Tax on Sales
                </label>
                <p className="mt-1 text-sm text-gray-500">
                  When disabled, the system stops calculating tax on invoices, receipts, POS sales, quotations, and reports.
                </p>
              </div>
              <Toggle
                id="taxEnabled"
                checked={taxSetting.taxEnabled}
                onChange={(value) =>
                  setTaxSetting((current) => ({ ...current, taxEnabled: value }))
                }
              />
            </div>
          </div>

          <div className="border-2 border-gray-200 p-4">
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Default Tax Calculation
            </label>
            <select
              value={taxSetting.defaultTaxCalculationType}
              onChange={(event) =>
                setTaxSetting((current) => ({
                  ...current,
                  defaultTaxCalculationType: event.target.value as TenantTaxSetting['defaultTaxCalculationType'],
                }))
              }
              className="w-full border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="ADD_TO_PRICE">Tax Added to Price — tax is calculated on top of the item price</option>
              <option value="INCLUSIVE">Tax Inclusive / Reverse Tax — item price already includes tax</option>
            </select>
            <p className="mt-2 text-xs text-gray-500">
              Individual products can override this setting.
            </p>
          </div>

          {defaultTaxes.length > 0 && (
            <div className="border-2 border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">Active default tax bundle</p>
              <p className="mt-1 text-xs text-blue-700">
                All taxable items use these rates by default. Mark more than one active tax as default to combine rates (e.g. VAT + NHIL + GETFund).
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {defaultTaxes.map((rate) => (
                  <span
                    key={rate.id}
                    className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-800"
                  >
                    {rate.name} — {rate.ratePercentage}%
                  </span>
                ))}
                <span className="rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-bold text-blue-900">
                  Total: {defaultTaxes.reduce((sum, r) => sum + r.ratePercentage, 0).toFixed(2)}%
                </span>
              </div>
            </div>
          )}

          {settingsError && (
            <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {settingsError}
            </div>
          )}
          {settingsMessage && (
            <div className="flex items-center gap-2 border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              <Check className="h-4 w-4 shrink-0" />
              {settingsMessage}
            </div>
          )}

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={saveSettings}
              disabled={settingsSaving}
              className="bg-blue-600 px-6 py-3 font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {settingsSaving ? 'Saving…' : 'Save Tax Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Tax Rates */}
      <div className="border-2 border-gray-200 bg-white p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Tax Rates</h3>
            <p className="text-sm text-gray-600">
              Create named taxes, activate them when they take effect, and map each one to a liability account.
            </p>
          </div>
          <button
            type="button"
            onClick={resetRateForm}
            className="border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            + New Tax Rate
          </button>
        </div>

        {rateMessage && (
          <div className="mb-4 flex items-center gap-2 border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            <Check className="h-4 w-4 shrink-0" />
            {rateMessage}
          </div>
        )}
        {rateError && (
          <div className="mb-4 flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            {rateError}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          {/* Rate list */}
          <div className="space-y-4">
            {taxRates.length === 0 ? (
              <div className="flex flex-col items-center gap-3 border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
                <div className="bg-gray-200 p-3">
                  <Percent className="h-6 w-6 text-gray-500" />
                </div>
                <p className="text-sm font-semibold text-gray-700">No tax rates yet</p>
                <p className="max-w-xs text-xs text-gray-500">
                  Add your first tax rate using the form on the right. You can create multiple rates — for example VAT, NHIL, and GETFund Levy — and mark several as default to apply them together on every taxable sale.
                </p>
              </div>
            ) : (
              taxRates.map((rate) => {
                const isDeleting = deletingId === rate.id
                const isToggling = togglingId === rate.id
                const isPendingDelete = pendingDeleteId === rate.id
                const isEditing = editingTaxRateId === rate.id

                return (
                  <div
                    key={rate.id}
                    className={`border-2 p-4 transition-colors ${
                      isEditing
                        ? 'border-blue-400 bg-blue-50'
                        : rate.isActive
                          ? 'border-gray-200 bg-white'
                          : 'border-amber-200 bg-amber-50'
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-bold text-gray-900">
                            {rate.name}
                          </h4>
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-bold text-gray-700">
                            {rate.ratePercentage}%
                          </span>
                          {rate.isDefault && (
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                              Default
                            </span>
                          )}
                          {!rate.isActive && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                              Inactive
                            </span>
                          )}
                          {isEditing && (
                            <span className="rounded-full bg-blue-200 px-2.5 py-1 text-xs font-bold text-blue-800">
                              Editing
                            </span>
                          )}
                        </div>

                        {rate.description && (
                          <p className="mt-1 text-sm text-gray-600">{rate.description}</p>
                        )}

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span>
                            From:{' '}
                            <strong className="text-gray-700">
                              {formatDateDisplay(rate.effectiveFrom) ?? 'Not set'}
                            </strong>
                          </span>
                          <span>
                            To:{' '}
                            <strong className="text-gray-700">
                              {formatDateDisplay(rate.effectiveTo) ?? 'Open-ended'}
                            </strong>
                          </span>
                          {enableAccounting && (
                            <span>
                              Account:{' '}
                              <strong className="text-gray-700">
                                {rate.taxPayableAccount
                                  ? `${rate.taxPayableAccount.code} — ${rate.taxPayableAccount.name}`
                                  : 'Auto / Unmapped'}
                              </strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      {isPendingDelete ? (
                        <div className="flex shrink-0 flex-col gap-2 border border-red-200 bg-red-50 p-3">
                          <p className="text-xs font-semibold text-red-800">
                            Delete <span className="font-bold">{rate.name}</span>? This cannot be undone.
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => confirmDelete(rate)}
                              disabled={isDeleting}
                              className="flex-1 bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              {isDeleting ? 'Deleting…' : 'Yes, delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(null)}
                              className="flex-1 border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => editTaxRate(rate)}
                            className="border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActiveState(rate)}
                            disabled={isToggling}
                            className="border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                          >
                            {isToggling ? '…' : rate.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(rate.id)}
                            className="border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Rate form */}
          <div ref={formRef} className="border-2 border-gray-200 bg-gray-50 p-5">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-lg font-bold text-gray-900">
                {editingTaxRateId ? 'Edit Tax Rate' : 'New Tax Rate'}
              </h4>
              {editingTaxRateId && (
                <button
                  type="button"
                  onClick={resetRateForm}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  aria-label="Cancel editing"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Tax names are fully dynamic. Combine multiple active defaults on the same sale.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Tax Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={taxRateForm.name}
                  onChange={(event) => updateRateForm('name', event.target.value)}
                  placeholder="e.g. VAT, NHIL, GETFund Levy"
                  className={`w-full border px-4 py-2 text-sm focus:outline-none focus:ring-2 ${
                    formErrors.name
                      ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                  }`}
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Rate Percentage <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={taxRateForm.ratePercentage}
                    onChange={(event) => updateRateForm('ratePercentage', event.target.value)}
                    placeholder="0.00"
                    className={`w-full border py-2 pl-4 pr-10 text-sm focus:outline-none focus:ring-2 ${
                      formErrors.ratePercentage
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                    }`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">
                    %
                  </span>
                </div>
                {formErrors.ratePercentage ? (
                  <p className="mt-1 text-xs text-red-600">{formErrors.ratePercentage}</p>
                ) : taxRateForm.ratePercentage !== '' && !isNaN(Number(taxRateForm.ratePercentage)) && (
                  <p className="mt-1 text-xs text-gray-500">
                    On a GHS 100.00 sale:{' '}
                    <strong>
                      GHS {(Number(taxRateForm.ratePercentage)).toFixed(2)} tax
                    </strong>{' '}
                    (ADD) or{' '}
                    <strong>
                      GHS {(100 - 100 / (1 + Number(taxRateForm.ratePercentage) / 100)).toFixed(2)} tax
                    </strong>{' '}
                    (INCLUSIVE)
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={taxRateForm.description}
                  onChange={(event) => updateRateForm('description', event.target.value)}
                  rows={2}
                  placeholder="Optional note about this tax"
                  className="w-full border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Effective From</label>
                  <input
                    type="date"
                    value={taxRateForm.effectiveFrom}
                    onChange={(event) => updateRateForm('effectiveFrom', event.target.value)}
                    className="w-full border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Effective To</label>
                  <input
                    type="date"
                    value={taxRateForm.effectiveTo}
                    onChange={(event) => updateRateForm('effectiveTo', event.target.value)}
                    className={`w-full border px-4 py-2 text-sm focus:outline-none focus:ring-2 ${
                      formErrors.effectiveTo
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                    }`}
                  />
                  {formErrors.effectiveTo && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.effectiveTo}</p>
                  )}
                  {!formErrors.effectiveTo && (
                    <p className="mt-1 text-xs text-gray-400">Leave blank for open-ended</p>
                  )}
                </div>
              </div>

              {enableAccounting && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tax Payable Account</label>
                  <select
                    value={taxRateForm.taxPayableAccountId}
                    onChange={(event) => updateRateForm('taxPayableAccountId', event.target.value)}
                    className="w-full border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Auto-create / use default Tax Payable (2110)</option>
                    {liabilityAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} — {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-3 border border-gray-200 bg-white p-4">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={taxRateForm.isDefault}
                    onChange={(event) => updateRateForm('isDefault', event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Apply by default on all taxable items
                </label>
                <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={taxRateForm.isActive}
                    onChange={(event) => updateRateForm('isActive', event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Active and available for new transactions
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={saveTaxRate}
                  disabled={rateSaving}
                  className="flex-1 bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {rateSaving
                    ? 'Saving…'
                    : editingTaxRateId
                      ? 'Update Tax Rate'
                      : 'Create Tax Rate'}
                </button>
                {editingTaxRateId && (
                  <button
                    type="button"
                    onClick={resetRateForm}
                    className="border border-gray-200 px-4 py-3 font-semibold text-gray-700 hover:bg-white"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
