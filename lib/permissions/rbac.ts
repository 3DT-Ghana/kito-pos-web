import { NextResponse } from 'next/server'

// Role enum values — kept in sync with prisma/schema.prisma
// Using string literal union so this works before and after migration
export type Role =
  | 'OWNER'
  | 'STORE_MANAGER'
  | 'BRANCH_MANAGER'
  | 'CASHIER'
  | 'INVENTORY_MANAGER'
  | 'ACCOUNTANT'
  | 'STAFF'

// Namespace object matching Prisma's Role enum shape so call sites stay identical
export const Role = {
  OWNER: 'OWNER' as const,
  STORE_MANAGER: 'STORE_MANAGER' as const,
  BRANCH_MANAGER: 'BRANCH_MANAGER' as const,
  CASHIER: 'CASHIER' as const,
  INVENTORY_MANAGER: 'INVENTORY_MANAGER' as const,
  ACCOUNTANT: 'ACCOUNTANT' as const,
  STAFF: 'STAFF' as const,
}

/**
 * Role-Based Access Control (RBAC) System
 *
 * Business Management — EYO Solutions
 *
 * Role Hierarchy (highest to lowest):
 * - OWNER:             Full access to all features and settings
 * - STORE_MANAGER:     Company-wide operational oversight across all branches
 * - BRANCH_MANAGER:    Full operational control for one branch, including branch staff
 * - CASHIER:           Sales & customer payments only
 * - INVENTORY_MANAGER: Stock/items/purchases management
 * - ACCOUNTANT:        Financial reports, payments & balances (read-heavy)
 * - STAFF:             Basic day-to-day operations (backward compatible)
 */

export const PERMISSIONS = {
  OWNER: [
    // User & Tenant Management
    'manage_users',
    'create_users',
    'delete_users',
    'update_user_roles',
    'manage_settings',
    'manage_tenant',
    'view_audit_logs',

    // Financial
    'view_all_reports',
    'view_profit_margins',
    'delete_transactions',
    'void_sales',
    'void_purchases',
    'record_payments',
    'adjust_balances',

    // Inventory
    'create_items',
    'update_items',
    'delete_items',
    'adjust_stock',
    'manage_manufacturers',

    // Customers & Suppliers
    'create_customers',
    'update_customers',
    'delete_customers',
    'create_suppliers',
    'update_suppliers',
    'delete_suppliers',

    // Sales & Purchases
    'create_sale',
    'create_purchase',
    'process_returns',
    'apply_discount',

    // Expenses
    'create_expenses',
    'view_expenses',
    'delete_expenses',

    // Till
    'manage_till',

    // Quotations
    'create_quotation',
    'view_quotations',
    'delete_quotation',

    // Waybills
    'manage_waybills',
    'delete_waybills',

    // Purchase Orders
    'create_purchase_order',
    'view_purchase_orders',
    'delete_purchase_order',

    // Accounting
    'view_chart_of_accounts',
    'manage_chart_of_accounts',
    'view_journal',
    'post_manual_journal',
    'view_accounting_reports',
    'record_transfers',

    // Payroll
    'view_payroll',
    'manage_employees',
    'run_payroll',
    'approve_payroll',

    // Approvals
    'approve_transactions',

    // View
    'view_basic_reports',
    'view_items',
    'view_customers',
    'view_suppliers',
  ],

  STORE_MANAGER: [
    // Financial (no user management or settings)
    'view_audit_logs',
    'view_all_reports',
    'view_profit_margins',
    'void_sales',
    'void_purchases',
    'record_payments',
    'adjust_balances',

    // Inventory
    'create_items',
    'update_items',
    'delete_items',
    'adjust_stock',
    'manage_manufacturers',

    // Customers & Suppliers
    'create_customers',
    'update_customers',
    'delete_customers',
    'create_suppliers',
    'update_suppliers',
    'delete_suppliers',

    // Sales & Purchases
    'create_sale',
    'create_purchase',
    'process_returns',
    'apply_discount',

    // Expenses
    'create_expenses',
    'view_expenses',
    'delete_expenses',

    // Till
    'manage_till',

    // Quotations
    'create_quotation',
    'view_quotations',
    'delete_quotation',

    // Waybills
    'manage_waybills',
    'delete_waybills',

    // Purchase Orders
    'create_purchase_order',
    'view_purchase_orders',
    'delete_purchase_order',

    // Accounting
    'view_chart_of_accounts',
    'manage_chart_of_accounts',
    'view_journal',
    'post_manual_journal',
    'view_accounting_reports',
    'record_transfers',

    // Payroll
    'view_payroll',
    'manage_employees',
    'run_payroll',
    'approve_payroll',

    // Approvals
    'approve_transactions',

    // View
    'view_basic_reports',
    'view_items',
    'view_customers',
    'view_suppliers',
  ],

  BRANCH_MANAGER: [
    // Branch team management
    'manage_users',
    'create_users',
    'delete_users',
    'update_user_roles',

    // Financial (branch-scoped through branch access)
    'view_all_reports',
    'view_profit_margins',
    'void_sales',
    'void_purchases',
    'record_payments',
    'adjust_balances',

    // Inventory
    'create_items',
    'update_items',
    'delete_items',
    'adjust_stock',
    'manage_manufacturers',

    // Customers & Suppliers
    'create_customers',
    'update_customers',
    'delete_customers',
    'create_suppliers',
    'update_suppliers',
    'delete_suppliers',

    // Sales & Purchases
    'create_sale',
    'create_purchase',
    'process_returns',
    'apply_discount',

    // Expenses
    'create_expenses',
    'view_expenses',
    'delete_expenses',

    // Till
    'manage_till',

    // Quotations
    'create_quotation',
    'view_quotations',
    'delete_quotation',

    // Waybills
    'manage_waybills',
    'delete_waybills',

    // Purchase Orders
    'create_purchase_order',
    'view_purchase_orders',
    'delete_purchase_order',

    // Accounting
    'view_chart_of_accounts',
    'view_journal',
    'view_accounting_reports',
    'record_transfers',

    // Payroll
    'view_payroll',
    'manage_employees',
    'run_payroll',

    // Approvals
    'approve_transactions',

    // View
    'view_basic_reports',
    'view_items',
    'view_customers',
    'view_suppliers',
  ],

  CASHIER: [
    // Sales & Payments
    'create_sale',
    'record_payments',

    // Till
    'manage_till',

    // Quotations
    'create_quotation',
    'view_quotations',

    // Waybills
    'manage_waybills',

    // Limited customer management
    'create_customers',
    'update_customers',

    // View
    'view_basic_reports',
    'view_items',
    'view_customers',
    'view_suppliers',
  ],

  INVENTORY_MANAGER: [
    // Inventory
    'create_items',
    'update_items',
    'adjust_stock',
    'manage_manufacturers',

    // Purchases & Suppliers
    'create_purchase',
    'create_suppliers',
    'update_suppliers',

    // Purchase Orders
    'create_purchase_order',
    'view_purchase_orders',

    // Waybills
    'manage_waybills',

    // View
    'view_basic_reports',
    'view_items',
    'view_customers',
    'view_suppliers',
  ],

  ACCOUNTANT: [
    // Financial
    'view_audit_logs',
    'view_all_reports',
    'view_profit_margins',
    'record_payments',
    'adjust_balances',

    // Expenses (view only)
    'view_expenses',

    // Accounting
    'view_chart_of_accounts',
    'view_journal',
    'post_manual_journal',
    'view_accounting_reports',
    'record_transfers',

    // Payroll
    'view_payroll',
    'manage_employees',
    'run_payroll',
    'approve_payroll',

    // Approvals
    'approve_transactions',

    // View
    'view_basic_reports',
    'view_items',
    'view_customers',
    'view_suppliers',
  ],

  STAFF: [
    // Day-to-day operations
    'create_sale',
    'create_purchase',
    'record_payments',

    // Limited inventory
    'update_items',

    // Limited customer/supplier
    'create_customers',
    'update_customers',
    'create_suppliers',
    'update_suppliers',

    // Waybills
    'manage_waybills',

    // View
    'view_basic_reports',
    'view_items',
    'view_customers',
    'view_suppliers',
  ],
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS][number]

// Flat deduplicated list of every known permission string
export const ALL_PERMISSIONS: Permission[] = Array.from(
  new Set(Object.values(PERMISSIONS).flatMap(p => p as unknown as Permission[]))
).sort() as Permission[]

// Permission groups for the UI
export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: 'Users & Settings',   permissions: ['manage_users','create_users','delete_users','update_user_roles','manage_settings','manage_tenant','view_audit_logs'] as Permission[] },
  { label: 'Financial',          permissions: ['view_all_reports','view_basic_reports','view_profit_margins','record_payments','adjust_balances','delete_transactions','void_sales','void_purchases'] as Permission[] },
  { label: 'Inventory',          permissions: ['view_items','create_items','update_items','delete_items','adjust_stock','manage_manufacturers'] as Permission[] },
  { label: 'Sales & Purchases',  permissions: ['create_sale','create_purchase','process_returns','apply_discount'] as Permission[] },
  { label: 'Customers & Suppliers', permissions: ['view_customers','create_customers','update_customers','delete_customers','view_suppliers','create_suppliers','update_suppliers','delete_suppliers'] as Permission[] },
  { label: 'Expenses',           permissions: ['view_expenses','create_expenses','delete_expenses'] as Permission[] },
  { label: 'Till',               permissions: ['manage_till'] as Permission[] },
  { label: 'Quotations',         permissions: ['view_quotations','create_quotation','delete_quotation'] as Permission[] },
  { label: 'Waybills',           permissions: ['manage_waybills','delete_waybills'] as Permission[] },
  { label: 'Purchase Orders',    permissions: ['view_purchase_orders','create_purchase_order','delete_purchase_order'] as Permission[] },
  { label: 'Accounting',         permissions: ['view_chart_of_accounts','manage_chart_of_accounts','view_journal','post_manual_journal','view_accounting_reports','record_transfers'] as Permission[] },
  { label: 'Payroll',            permissions: ['view_payroll','manage_employees','run_payroll','approve_payroll'] as Permission[] },
  { label: 'Approvals',          permissions: ['approve_transactions'] as Permission[] },
]

// Type for the rolePermissions JSON column stored in the DB
export type RolePermissionsMap = Partial<Record<Role, string[]>>

type PermissionSubject =
  | Role
  | { role: Role; rolePermissions?: RolePermissionsMap | null }
  | { user: { role: Role }; rolePermissions?: RolePermissionsMap | null }

function resolvePermissionSubject(
  subject: PermissionSubject,
  overrides?: RolePermissionsMap | null
) {
  if (typeof subject === 'string') {
    return { role: subject, overrides }
  }

  if ('user' in subject) {
    return {
      role: subject.user.role,
      overrides: subject.rolePermissions ?? overrides,
    }
  }

  return {
    role: subject.role,
    overrides: subject.rolePermissions ?? overrides,
  }
}

// Returns effective permissions for a role, applying DB overrides when present.
// OWNER always has all permissions and cannot be restricted.
export function resolveRolePermissions(role: Role, overrides: RolePermissionsMap | null): string[] {
  if (role === 'OWNER') return [...ALL_PERMISSIONS]
  const override = overrides?.[role]
  if (override && Array.isArray(override)) return override
  return [...(PERMISSIONS[role] as readonly string[])]
}

export function hasPermission(subject: PermissionSubject, permission: Permission, overrides?: RolePermissionsMap | null): boolean {
  const resolved = resolvePermissionSubject(subject, overrides)

  if (resolved.overrides !== undefined) {
    return resolveRolePermissions(resolved.role, resolved.overrides).includes(permission)
  }
  return (PERMISSIONS[resolved.role] as readonly string[])?.includes(permission) ?? false
}

export function hasAnyPermission(subject: PermissionSubject, permissions: Permission[], overrides?: RolePermissionsMap | null): boolean {
  return permissions.some(permission => hasPermission(subject, permission, overrides))
}

export function hasAllPermissions(subject: PermissionSubject, permissions: Permission[], overrides?: RolePermissionsMap | null): boolean {
  return permissions.every(permission => hasPermission(subject, permission, overrides))
}

export interface RoleCheckResult {
  authorized: boolean
  error: NextResponse | null
}

export function requireRole(
  userRole: Role,
  allowedRoles: Role[]
): RoleCheckResult {
  if (!allowedRoles.includes(userRole)) {
    return {
      authorized: false,
      error: NextResponse.json(
        {
          error: 'Forbidden',
          message: 'You do not have permission to perform this action',
          requiredRole: allowedRoles,
          yourRole: userRole,
        },
        { status: 403 }
      ),
    }
  }
  return { authorized: true, error: null }
}

export function requireOwner(userRole: Role): RoleCheckResult {
  return requireRole(userRole, [Role.OWNER])
}

export function requireOwnerOrManager(userRole: Role): RoleCheckResult {
  return requireRole(userRole, [Role.OWNER, Role.STORE_MANAGER])
}

export function requirePermission(
  subject: PermissionSubject,
  permission: Permission,
  overrides?: RolePermissionsMap | null
): RoleCheckResult {
  const resolved = resolvePermissionSubject(subject, overrides)

  if (!hasPermission(resolved.role, permission, resolved.overrides)) {
    return {
      authorized: false,
      error: NextResponse.json(
        {
          error: 'Forbidden',
          message: `This action requires the '${permission}' permission`,
          yourRole: resolved.role,
        },
        { status: 403 }
      ),
    }
  }
  return { authorized: true, error: null }
}

export function requireOwnerOrPermission(
  userRole: Role,
  permission: Permission,
  overrides?: RolePermissionsMap | null
): RoleCheckResult {
  if (userRole === Role.OWNER) {
    return { authorized: true, error: null }
  }
  return requirePermission(userRole, permission, overrides)
}

export function getPermissionsForRole(role: Role): readonly Permission[] {
  return PERMISSIONS[role] ?? []
}

export const COMPANY_ADMIN_ROLES = [
  Role.OWNER,
  Role.STORE_MANAGER,
] as const

export const BRANCH_MANAGER_MANAGED_ROLES = [
  Role.CASHIER,
  Role.INVENTORY_MANAGER,
  Role.STAFF,
] as const

export function canViewAllBranchesForRole(role: Role) {
  return COMPANY_ADMIN_ROLES.includes(role as typeof COMPANY_ADMIN_ROLES[number])
}

export function canManageUsersForRole(role: Role) {
  return role === Role.OWNER || role === Role.BRANCH_MANAGER
}

export function getManageableRolesForRole(role: Role): readonly Role[] {
  if (role === Role.OWNER) {
    return ALL_ROLES
  }

  if (role === Role.BRANCH_MANAGER) {
    return BRANCH_MANAGER_MANAGED_ROLES
  }

  return []
}

export function canManageTargetUserRole(actorRole: Role, targetRole: Role) {
  return getManageableRolesForRole(actorRole).includes(targetRole)
}

export const ALL_ROLES = [
  Role.OWNER,
  Role.STORE_MANAGER,
  Role.BRANCH_MANAGER,
  Role.CASHIER,
  Role.INVENTORY_MANAGER,
  Role.ACCOUNTANT,
  Role.STAFF,
] as const
