import { prisma } from '@/lib/db/prisma'

// Canonical feature module definitions that map to existing tenant feature flags.
// sortOrder groups them: 0–9 = core, 10–19 = finance, 20–29 = operations, 30+ = add-ons.
const CANONICAL_MODULES = [
  { key: 'pos',             name: 'POS Module',              category: 'Module',  sortOrder: 1,  description: 'Point-of-sale terminal for in-store sales.' },
  { key: 'inventory',       name: 'Inventory Module',        category: 'Module',  sortOrder: 2,  description: 'Full stock tracking, adjustments, and transfers.' },
  { key: 'accounting',      name: 'Accounting Module',       category: 'Module',  sortOrder: 10, description: 'Double-entry ledger, chart of accounts, and journal entries.' },
  { key: 'payroll',         name: 'Payroll Module',          category: 'Module',  sortOrder: 11, description: 'Ghana payroll with PAYE, SSF, and SSNIT deductions.' },
  { key: 'multi_branch',    name: 'Multi-Branch',            category: 'Module',  sortOrder: 20, description: 'Manage multiple business locations under one account.' },
  { key: 'purchase_orders', name: 'Purchase Management',     category: 'Module',  sortOrder: 21, description: 'Purchase orders, supplier invoices, and receiving.' },
  { key: 'quotations',      name: 'Quotations',              category: 'Module',  sortOrder: 22, description: 'Create, send, and convert quotations to sales.' },
  { key: 'expense_tracking',name: 'Expense Tracking',        category: 'Module',  sortOrder: 23, description: 'Track and categorise business expenses.' },
  { key: 'till',            name: 'Till / Cash Register',    category: 'Module',  sortOrder: 24, description: 'Daily till open/close and cash reconciliation.' },
  { key: 'expiry_tracking', name: 'Expiry Tracking',         category: 'Add-on', sortOrder: 30, description: 'Track product expiry dates and receive alerts.' },
  { key: 'credit_sales',    name: 'Credit Sales',            category: 'Add-on', sortOrder: 31, description: 'Sell on credit and manage customer balances.' },
  { key: 'barcodes',        name: 'Barcode Management',      category: 'Add-on', sortOrder: 32, description: 'Generate, print, and scan product barcodes.' },
  { key: 'sms_notifications', name: 'SMS Notifications',     category: 'Service', sortOrder: 40, description: 'Send SMS alerts to customers via Hubtel Ghana.' },
  { key: 'reporting',       name: 'Reporting & Analytics',   category: 'Service', sortOrder: 41, description: 'Advanced reports: sales, inventory, debtors, tax, payroll.' },
  { key: 'mobile_app',      name: 'Mobile App Access',       category: 'Service', sortOrder: 42, description: 'Access the system from the Android/iOS mobile app.' },
  { key: 'approval',        name: 'Approval Workflow',       category: 'Add-on', sortOrder: 33, description: 'Require manager approval for sensitive operations.' },
]

/**
 * Upserts all canonical feature modules.
 * Safe to call multiple times — only creates missing rows, never overwrites pricing.
 */
export async function seedFeatureModules() {
  for (const mod of CANONICAL_MODULES) {
    await prisma.featureModule.upsert({
      where: { key: mod.key },
      create: mod,
      update: { name: mod.name, description: mod.description, category: mod.category, sortOrder: mod.sortOrder },
    })
  }
}
