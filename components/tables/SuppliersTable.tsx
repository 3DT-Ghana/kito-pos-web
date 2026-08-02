'use client'

import { DataTable, Column } from './DataTable'
import { formatCurrency, formatDate } from '@/lib/utils/format'

/**
 * Suppliers Table Component
 *
 * Displays suppliers with balance and transaction info
 */

interface SupplierRow {
  id?: string
  name: string
  phone?: string | null
  balance: number
  _count?: { purchases?: number; payments?: number }
  purchases?: Array<{ totalAmount: number; createdAt: string }>
}

interface SuppliersTableProps {
  suppliers: SupplierRow[]
  onSupplierClick?: (supplier: SupplierRow) => void
}

export function SuppliersTable({ suppliers, onSupplierClick }: SuppliersTableProps) {
  const columns: Column<SupplierRow>[] = [
    {
      key: 'name',
      label: 'Supplier Name',
      sortable: true,
      render: (supplier) => (
        <div>
          <div className="font-medium text-gray-900">{supplier.name}</div>
          {supplier.phone && (
            <div className="text-xs text-gray-500">{supplier.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: 'balance',
      label: 'Balance',
      sortable: true,
      render: (supplier) => (
        <span
          className={`font-semibold ${
            supplier.balance > 0 ? 'text-red-600' : 'text-green-600'
          }`}
        >
          {formatCurrency(supplier.balance)}
        </span>
      ),
      className: 'text-right',
    },
    {
      key: '_count',
      label: 'Total Purchases',
      sortable: true,
      render: (supplier) => (
        <span className="text-gray-600">
          {supplier._count?.purchases || 0}
        </span>
      ),
      className: 'text-center',
    },
    {
      key: 'totalAmount',
      label: 'Total Amount',
      sortable: true,
      render: (supplier) => {
        const total = supplier.purchases?.reduce(
          (sum: number, purchase: { totalAmount: number }) => sum + purchase.totalAmount,
          0
        ) || 0
        return <span className="text-gray-900">{formatCurrency(total)}</span>
      },
      className: 'text-right',
    },
    {
      key: 'payments',
      label: 'Payments',
      sortable: true,
      render: (supplier) => (
        <span className="text-gray-600">
          {supplier._count?.payments || 0}
        </span>
      ),
      className: 'text-center',
    },
    {
      key: 'lastPurchase',
      label: 'Last Purchase',
      sortable: true,
      render: (supplier) => {
        const lastPurchase = supplier.purchases?.[0]
        return lastPurchase ? (
          <span className="text-xs text-gray-500">
            {formatDate(lastPurchase.createdAt)}
          </span>
        ) : (
          <span className="text-xs text-gray-400">Never</span>
        )
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (supplier) => {
        if (supplier.balance > 0) {
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 -full text-xs font-medium bg-red-100 text-red-800">
              Creditor
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 -full text-xs font-medium bg-green-100 text-green-800">
            Clear
          </span>
        )
      },
    },
  ]

  return (
    <DataTable
      data={suppliers}
      columns={columns}
      searchPlaceholder="Search suppliers by name, phone..."
      emptyMessage="No suppliers found"
      onRowClick={onSupplierClick}
    />
  )
}
