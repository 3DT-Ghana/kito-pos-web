/**
 * Central Type Definitions
 *
 * Re-exports Prisma types and defines additional app types
 */

// Re-export Prisma types
export type {
  Tenant,
  User,
  Manufacturer,
  Item,
  Customer,
  Supplier,
  Sale,
  SaleItem,
  Purchase,
  PurchaseItem,
  CustomerPayment,
  SupplierPayment,
  CustomerReturn,
  SupplierReturn,
  StockAdjustment,
  AuditLog,
} from '@prisma/client'

// Re-export Prisma enums
export {
  Role,
  TenantStatus,
  PaymentType,
  PaymentMethod,
  StockAdjustmentType,
  ReturnType,
} from '@prisma/client'

// Extended types with relations
export interface ItemWithManufacturer {
  id: string
  tenantId: string
  manufacturerId: string
  name: string
  quantity: number
  reorderLevel: number
  costPrice: number
  sellingPrice: number
  createdAt: Date
  manufacturer: {
    id: string
    name: string
  }
}

export interface SaleWithDetails {
  id: string
  tenantId: string
  customerId: string | null
  totalAmount: number
  paidAmount: number
  paymentType: string
  paymentMethod: string
  createdAt: Date
  customer?: {
    id: string
    name: string
  } | null
  items: {
    id: string
    quantity: number
    price: number
    item: {
      id: string
      name: string
    }
  }[]
}

export interface PurchaseWithDetails {
  id: string
  tenantId: string
  supplierId: string
  totalAmount: number
  paidAmount: number
  paymentType: string
  createdAt: Date
  supplier: {
    id: string
    name: string
  }
  items: {
    id: string
    quantity: number
    costPrice: number
    item: {
      id: string
      name: string
    }
  }[]
}

export interface CustomerWithSummary {
  id: string
  tenantId: string
  name: string
  phone: string | null
  balance: number
  _count?: {
    sales: number
  }
}

export interface SupplierWithSummary {
  id: string
  tenantId: string
  name: string
  phone: string | null
  balance: number
  _count?: {
    purchases: number
  }
}

export interface CustomerReturnWithDetails {
  id: string
  tenantId: string
  saleId: string
  itemId: string
  quantity: number
  type: string
  amount: number
  createdAt: Date
  item: { id: string; name: string }
  sale: {
    id: string
    customer: { id: string; name: string } | null
  }
}

export interface SupplierReturnWithDetails {
  id: string
  tenantId: string
  purchaseId: string
  itemId: string
  quantity: number
  type: string
  amount: number
  createdAt: Date
  item: { id: string; name: string }
  purchase: {
    id: string
    supplier: { id: string; name: string }
  }
}
