import { z } from 'zod'

/**
 * Form Validation Schemas using Zod
 */

// Item form schema
export const itemSchema = z.object({
  manufacturerId: z.string().min(1, 'Manufacturer is required'),
  name: z.string().min(1, 'Item name is required'),
  quantity: z.number().min(0, 'Quantity must be 0 or greater').optional(),
  reorderLevel: z.number().int().min(0, 'Reorder level must be 0 or greater').optional(),
  costPrice: z.number().min(0, 'Cost price must be positive'),
  sellingPrice: z.number().min(0, 'Selling price must be positive'),
  unitName: z.string().optional(),
  piecesPerUnit: z.number().int().min(1, 'Must be at least 1').optional(),
  retailPrice: z.number().min(0).optional(),
  wholesalePrice: z.number().min(0).optional(),
  promoPrice: z.number().min(0).optional(),
  barcode: z.string().optional(),
  expiryDate: z.string().optional(),
  categoryId: z.string().optional(),
  // Accounting fields
  itemType: z.enum(['INVENTORY', 'NON_INVENTORY', 'SERVICE']).optional(),
  incomeAccountId: z.string().optional(),
  cogsAccountId: z.string().optional(),
  expenseAccountId: z.string().optional(),
  // Tax fields
  isTaxable: z.boolean().optional(),
  useTenantDefaultTaxes: z.boolean().optional(),
  taxRateId: z.string().optional(),
  taxRateIds: z.array(z.string()).optional(),
  taxCalculationType: z.enum(['ADD_TO_PRICE', 'INCLUSIVE']).optional(),
}).refine(data => data.sellingPrice >= data.costPrice, {
  message: 'Selling price should not be less than cost price',
  path: ['sellingPrice'],
})

export type ItemFormData = z.infer<typeof itemSchema>

// Customer form schema
export const customerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  phone: z.string().optional(),
})

export type CustomerFormData = z.infer<typeof customerSchema>

// Supplier form schema
export const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  phone: z.string().optional(),
})

export type SupplierFormData = z.infer<typeof supplierSchema>

// Sale item schema
export const saleItemSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  price: z.number().min(0, 'Price must be positive').optional(),
})

// Sale form schema
export const saleSchema = z.object({
  customerId: z.string().optional(),
  paidAmount: z.number().min(0, 'Paid amount must be 0 or greater').optional(),
  items: z.array(saleItemSchema).min(1, 'At least one item is required'),
})

export type SaleFormData = z.infer<typeof saleSchema>

// Purchase item schema
export const purchaseItemSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  costPrice: z.number().min(0, 'Cost price must be positive').optional(),
})

// Purchase form schema
export const purchaseSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  paidAmount: z.number().min(0, 'Paid amount must be 0 or greater').optional(),
  items: z.array(purchaseItemSchema).min(1, 'At least one item is required'),
})

export type PurchaseFormData = z.infer<typeof purchaseSchema>

// Payment form schema
export const paymentSchema = z.object({
  customerId: z.string().optional(),
  supplierId: z.string().optional(),
  amount: z.number().min(0.01, 'Payment amount must be greater than 0'),
  method: z.enum(['CASH', 'MOMO', 'BANK'], {
    message: 'Payment method is required',
  }),
}).refine(data => data.customerId || data.supplierId, {
  message: 'Either customer or supplier is required',
  path: ['customerId'],
})

export type PaymentFormData = z.infer<typeof paymentSchema>

// Stock adjustment form schema
export const stockAdjustmentSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  type: z.enum(['INCREASE', 'DECREASE'], {
    message: 'Adjustment type is required',
  }),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
})

export type StockAdjustmentFormData = z.infer<typeof stockAdjustmentSchema>

// Login form schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export type LoginFormData = z.infer<typeof loginSchema>

// Registration form schema
export const registrationSchema = z.object({
  name: z.string().min(1, 'Your name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  businessName: z.string().min(1, 'Business name is required'),
  phone: z.string().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export type RegistrationFormData = z.infer<typeof registrationSchema>
