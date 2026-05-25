'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'

interface FeaturesSettingsProps {
  tenantId: string
  initialSettings: {
    enablePosTerminal: boolean
    enableQuotations: boolean
    enablePurchaseOrders: boolean
    enableExpiryTracking: boolean
    enableBranches: boolean
    enableCreditSales: boolean
    enableExpenses: boolean
    enableTill: boolean
    allowSaleOnZeroStock: boolean
    enableBarcodeGenerator: boolean
    enableAccounting: boolean
    enablePayroll: boolean
    requireApproval: boolean
  }
}

function Toggle({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      id={id}
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer -full border-3 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        checked ? 'bg-blue-600 border-blue-600' : 'bg-gray-200 border-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-full w-7 transform -full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-8' : 'translate-x-0'
        }`}
      >
        {checked && <Check className="w-full h-full p-1 text-blue-600" />}
      </span>
    </button>
  )
}

export function FeaturesSettings({ tenantId, initialSettings }: FeaturesSettingsProps) {
  const [settings, setSettings] = useState(initialSettings)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const toggle = (key: keyof typeof settings) =>
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed')
      setMessage('Settings saved! Refresh to see sidebar changes.')
      setTimeout(() => setMessage(''), 4000)
    } catch {
      setMessage('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const groups: {
    label: string
    icon: string
    items: { key: keyof typeof settings; label: string; icon: string; desc: string }[]
  }[] = [
    {
      label: 'Sales & Checkout',
      icon: '💳',
      items: [
        {
          key: 'enablePosTerminal',
          label: 'POS Terminal',
          icon: '🖥️',
          desc: 'Fullscreen point-of-sale interface designed for supermarkets and convenience stores. Barcode scanning, quick-add tiles, numpad, and instant checkout.',
        },
        {
          key: 'enableCreditSales',
          label: 'Credit Sales',
          icon: '💳',
          desc: 'Allow selling on credit — the customer pays later and a debt is recorded. When disabled, all sales must be paid in full at checkout.',
        },
      ],
    },
    {
      label: 'Documents',
      icon: '📄',
      items: [
        {
          key: 'enableQuotations',
          label: 'Quotations',
          icon: '📄',
          desc: 'Create price quotations for customers before a sale is confirmed. Quotations can be converted into actual sales.',
        },
        {
          key: 'enablePurchaseOrders',
          label: 'Purchase Orders',
          icon: '📋',
          desc: 'Create and send purchase orders to suppliers before receiving goods. Track expected deliveries and convert POs into purchases.',
        },
      ],
    },
    {
      label: 'Operations',
      icon: '⚙️',
      items: [
        {
          key: 'enableBranches',
          label: 'Branches / Multi-Location',
          icon: '🏪',
          desc: 'Manage multiple store locations or warehouses. Each branch has its own inventory, sales, stock transfers, and cash register. Owner can view consolidated reports.',
        },
        {
          key: 'enableExpenses',
          label: 'Expenses',
          icon: '💸',
          desc: 'Record business expenses (rent, salaries, utilities, transport) to track actual costs and profit accurately.',
        },
        {
          key: 'enableTill',
          label: 'Till / Cash Register',
          icon: '🏧',
          desc: 'Manage shift cash register — open/close shifts, track float, cash sales, and end-of-shift variance.',
        },
      ],
    },
    {
      label: 'Inventory',
      icon: '📦',
      items: [
        {
          key: 'enableExpiryTracking',
          label: 'Expiry Date Tracking',
          icon: '📅',
          desc: 'Track expiry dates on items. Get alerts for items expiring within 30 days. Ideal for pharmacies, food stores, and FMCG businesses.',
        },
        {
          key: 'enableBarcodeGenerator',
          label: 'Barcode & Label Printing',
          icon: '🏷️',
          desc: 'Generate and print barcode (Code128) or QR code stickers for your items. Choose label size, quantity per item, and print directly from the inventory page. Ideal for shops that manufacture or repackage their own products.',
        },
      ],
    },
    {
      label: 'Finance & Accounting',
      icon: '📒',
      items: [
        {
          key: 'enableAccounting',
          label: 'Double-Entry Accounting',
          icon: '📒',
          desc: 'Automatically post journal entries for every sale, purchase, payment, expense, return, and stock adjustment. Includes Chart of Accounts, Journal Ledger, and financial reports (P&L, Balance Sheet, Trial Balance).',
        },
        {
          key: 'enablePayroll',
          label: 'Payroll (Ghana)',
          icon: '💼',
          desc: 'Manage employee records and run monthly payroll with automatic Ghana PAYE plus Tier 1 pension deductions. Disbursing payroll posts the cash/bank movement and statutory liabilities when accounting is enabled.',
        },
        {
          key: 'requireApproval',
          label: 'Transaction Approvals',
          icon: '🔐',
          desc: 'Require manager approval for sensitive transactions — discounts, price overrides, credit sales, and stock adjustments — when performed by CASHIER or STAFF. Managers (OWNER, STORE_MANAGER, BRANCH_MANAGER, ACCOUNTANT) can approve inline via PIN on the POS or through the Approvals queue.',
        },
      ],
    },
    {
      label: 'Sales Behaviour',
      icon: '🛒',
      items: [
        {
          key: 'allowSaleOnZeroStock',
          label: 'Allow Sales on Zero Stock',
          icon: '⚡',
          desc: 'Let cashiers sell items even when stock is at zero. Useful when stock updates lag behind actual arrivals. A warning is still shown so cashiers stay aware.',
        },
      ],
    },
  ]

  return (
    <div className="bg-white shadow-sm border-2 border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-purple-100 p-3">
          <span className="text-2xl">🔌</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Features & Modules</h2>
          <p className="text-sm text-gray-600">
            Enable only the features your business needs. Disabled features are hidden from the navigation.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {groups.map(group => (
          <div key={group.label}>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <span>{group.icon}</span> {group.label}
            </p>
            <div className="space-y-3">
              {group.items.map(({ key, label, icon, desc }) => (
                <div
                  key={key}
                  className={`border-2 p-4 transition-colors ${
                    settings[key] ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-2xl mt-0.5">{icon}</span>
                      <div>
                        <label htmlFor={key} className="text-base font-bold text-gray-900 cursor-pointer">
                          {label}
                        </label>
                        <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
                      </div>
                    </div>
                    <div className="shrink-0 mt-1">
                      <Toggle id={key} checked={settings[key]} onChange={() => toggle(key)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Note */}
        <div className="bg-amber-50 border-2 border-amber-200 p-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">ℹ️ How this works</p>
          <p className="text-xs text-amber-700">
            Toggling a feature ON adds it to the sidebar immediately after saving and refreshing.
            Existing data is never deleted when you disable a feature — it just becomes hidden.
          </p>
        </div>

        {/* Save */}
        <div className="flex items-center justify-between pt-4 border-t-2 border-gray-200">
          {message && (
            <div className={`text-sm font-semibold ${message.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </div>
          )}
          <div className={!message ? 'ml-auto' : ''}>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {saving ? 'Saving...' : 'Save Features'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
