import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { AppLayout } from '@/components/layout/AppLayout'
import { ReceiptSettings } from './ReceiptSettings'
import { UnitSettings } from './UnitSettings'
import { PricingSettings } from './PricingSettings'
import { SmsSettings } from './SmsSettings'
import { WhatsAppSettings } from './WhatsAppSettings'
import { FeaturesSettings } from './FeaturesSettings'
import { RolePermissionsSettings } from './RolePermissionsSettings'
import { TaxSettings } from './TaxSettings'
import { ApprovalPinSettings } from './ApprovalPinSettings'
import { Settings as SettingsIcon } from 'lucide-react'
import { Role, type RolePermissionsMap, hasPermission } from '@/lib/permissions/rbac'

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

  if (!user.tenantId) {
    redirect('/agent/dashboard')
  }

  const tenantAccess = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      id: true,
      name: true,
      rolePermissions: true,
    },
  })

  if (!tenantAccess) {
    redirect('/dashboard')
  }

  const rolePermissions = (tenantAccess.rolePermissions as RolePermissionsMap) ?? null
  const canManageSettings = user.role === Role.OWNER
  const canSetApprovalPin = hasPermission(
    { role: user.role, rolePermissions },
    'approve_transactions'
  )

  if (!canManageSettings && !canSetApprovalPin) {
    redirect('/dashboard')
  }

  if (!canManageSettings) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-3xl">
          <div className="flex items-center gap-3">
            <div className="bg-gray-100 p-3">
              <SettingsIcon className="w-8 h-8 text-gray-700" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Approval Settings</h1>
              <p className="text-gray-600 mt-1">
                Manage your approval PIN for {tenantAccess.name}
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border-2 border-blue-200 p-6 text-blue-900">
            Full business settings are limited to the account owner. You can still manage your approval PIN here.
          </div>

          {canSetApprovalPin && <ApprovalPinSettings />}
        </div>
      </AppLayout>
    )
  }

  // Fetch owner-only tenant settings after the access gate so sensitive fields
  // are never loaded for non-owner users.
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      id: true,
      name: true,
      phone: true,
      rolePermissions: true,
      showManufacturerOnReceipt: true,
      receiptPrinterWidth: true,
      receiptPrinterName: true,
      reportPrinterName: true,
      useUnitSystem: true,
      enableRetailPrice: true,
      enableWholesalePrice: true,
      enablePromoPrice: true,
      enableDiscounts: true,
      enableSmsNotifications: true,
      hubtelClientId: true,
      hubtelCollectionAccount: true,
      hubtelCallbackUrl: true,
      hubtelClientSecret: true,
      hubtelSenderId: true,
      enableWhatsApp: true,
      metaWabaToken: true,
      metaWabaPhoneNumberId: true,
      enablePosTerminal: true,
      enableQuotations: true,
      enablePurchaseOrders: true,
      enableExpiryTracking: true,
      enableBranches: true,
      enableCreditSales: true,
      enableExpenses: true,
      enableTill: true,
      enableMomoCollect: true,
      allowSaleOnZeroStock: true,
      enableBarcodeGenerator: true,
      enableAccounting: true,
      enablePayroll: true,
      requireApproval: true,
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
          <div className="bg-gray-100 p-3">
            <SettingsIcon className="w-8 h-8 text-gray-700" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-1">Configure your business settings</p>
          </div>
        </div>

        {/* Business Info */}
        <div className="bg-white shadow-sm border-2 border-gray-200 p-6">
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

        <TaxSettings
          tenantId={tenant.id}
          enableAccounting={tenant.enableAccounting}
        />

        {/* Receipt Settings */}
        <ReceiptSettings
          initialSettings={{
            showManufacturerOnReceipt: tenant.showManufacturerOnReceipt,
            receiptPrinterWidth: tenant.receiptPrinterWidth,
            receiptPrinterName: tenant.receiptPrinterName,
            reportPrinterName: tenant.reportPrinterName,
          }}
          tenantId={tenant.id}
        />

        {/* SMS Notifications Settings */}
        <SmsSettings
          tenantId={tenant.id}
          initialSettings={{
            enableSmsNotifications: tenant.enableSmsNotifications,
            hubtelClientIdSet: !!tenant.hubtelClientId,
            hubtelClientSecretSet: !!tenant.hubtelClientSecret,
            hubtelSenderId: tenant.hubtelSenderId,
            hubtelCollectionAccount: tenant.hubtelCollectionAccount,
            hubtelCallbackUrl: tenant.hubtelCallbackUrl,
          }}
        />

        {/* WhatsApp Notifications */}
        <WhatsAppSettings
          tenantId={tenant.id}
          initialSettings={{
            enableWhatsApp: tenant.enableWhatsApp,
            metaWabaTokenSet: !!tenant.metaWabaToken,
            metaWabaPhoneNumberId: tenant.metaWabaPhoneNumberId,
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
            enableMomoCollect: tenant.enableMomoCollect,
            allowSaleOnZeroStock: tenant.allowSaleOnZeroStock,
            enableBarcodeGenerator: tenant.enableBarcodeGenerator,
            enableAccounting: tenant.enableAccounting,
            enablePayroll: tenant.enablePayroll,
            requireApproval: tenant.requireApproval ?? false,
          }}
        />

        {/* Approval PIN — only shown to users with approve_transactions permission */}
        {canSetApprovalPin && <ApprovalPinSettings />}

        {/* Role Permissions */}
        <RolePermissionsSettings
          initialOverrides={(tenant.rolePermissions as RolePermissionsMap) ?? null}
        />

        {/* Help Section */}
        <div className="bg-blue-50 border-2 border-blue-200 p-6">
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
