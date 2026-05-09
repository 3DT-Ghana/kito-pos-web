import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { AppLayout } from '@/components/layout/AppLayout'
import { ReceiptSettings } from './ReceiptSettings'
import { UnitSettings } from './UnitSettings'
import { PricingSettings } from './PricingSettings'
import { SmsSettings } from './SmsSettings'
import { FeaturesSettings } from './FeaturesSettings'
import { RolePermissionsSettings } from './RolePermissionsSettings'
import { Settings as SettingsIcon } from 'lucide-react'
import { type RolePermissionsMap } from '@/lib/permissions/rbac'

/**
 * Settings Page
 *
 * Includes:
 * - Receipt configuration (manufacturer display, printer width)
 * - Future: Business info, user management, etc.
 */

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)

  if (!session || !session.user) {
    redirect('/auth/login')
  }

  const { user } = session

  // Fetch tenant settings
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      id: true,
      name: true,
      phone: true,
      rolePermissions: true,
      showManufacturerOnReceipt: true,
      receiptPrinterWidth: true,
      useUnitSystem: true,
      enableRetailPrice: true,
      enableWholesalePrice: true,
      enablePromoPrice: true,
      enableDiscounts: true,
      enableSmsNotifications: true,
      hubtelClientId: true,
      hubtelClientSecret: true,
      hubtelSenderId: true,
      enablePosTerminal: true,
      enableQuotations: true,
      enablePurchaseOrders: true,
      enableExpiryTracking: true,
      enableBranches: true,
      enableCreditSales: true,
      enableExpenses: true,
      enableTill: true,
      allowSaleOnZeroStock: true,
    },
  })

  if (!tenant) {
    redirect('/dashboard')
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="bg-gray-100 p-3 rounded-lg">
            <SettingsIcon className="w-8 h-8 text-gray-700" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-1">Configure your business settings</p>
          </div>
        </div>

        {/* Business Info */}
        <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Business Information</h2>
          <div className="space-y-3 text-gray-700">
            <div>
              <span className="font-semibold">Business Name:</span> {tenant.name}
            </div>
            {tenant.phone && (
              <div>
                <span className="font-semibold">Phone:</span> {tenant.phone}
              </div>
            )}
          </div>
        </div>

        {/* Unit System Settings */}
        <UnitSettings
          initialUseUnitSystem={tenant.useUnitSystem}
          tenantId={tenant.id}
        />

        {/* Pricing & Discounts Settings */}
        <PricingSettings
          initialSettings={{
            enableRetailPrice: tenant.enableRetailPrice,
            enableWholesalePrice: tenant.enableWholesalePrice,
            enablePromoPrice: tenant.enablePromoPrice,
            enableDiscounts: tenant.enableDiscounts,
          }}
          tenantId={tenant.id}
        />

        {/* Receipt Settings */}
        <ReceiptSettings
          initialSettings={{
            showManufacturerOnReceipt: tenant.showManufacturerOnReceipt,
            receiptPrinterWidth: tenant.receiptPrinterWidth,
          }}
          tenantId={tenant.id}
        />

        {/* SMS Notifications Settings */}
        <SmsSettings
          tenantId={tenant.id}
          initialSettings={{
            enableSmsNotifications: tenant.enableSmsNotifications,
            hubtelClientId: tenant.hubtelClientId,
            hubtelClientSecret: tenant.hubtelClientSecret,
            hubtelSenderId: tenant.hubtelSenderId,
          }}
        />

        {/* Features & Modules */}
        <FeaturesSettings
          tenantId={tenant.id}
          initialSettings={{
            enablePosTerminal: tenant.enablePosTerminal,
            enableQuotations: tenant.enableQuotations,
            enablePurchaseOrders: tenant.enablePurchaseOrders,
            enableExpiryTracking: tenant.enableExpiryTracking,
            enableBranches: tenant.enableBranches,
            enableCreditSales: tenant.enableCreditSales,
            enableExpenses: tenant.enableExpenses,
            enableTill: tenant.enableTill,
            allowSaleOnZeroStock: tenant.allowSaleOnZeroStock,
          }}
        />

        {/* Role Permissions */}
        <RolePermissionsSettings
          initialOverrides={(tenant.rolePermissions as RolePermissionsMap) ?? null}
        />

        {/* Help Section */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
          <h3 className="text-xl font-bold text-blue-900 mb-2">Need Help?</h3>
          <p className="text-blue-800">
            These settings control how your sales receipts are printed.
            The manufacturer name helps distinguish between items with the same name from different manufacturers.
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
