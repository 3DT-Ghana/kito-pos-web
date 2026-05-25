'use client'

import { DataTable, Column } from './DataTable'
import { formatCurrency, formatDate } from '@/lib/utils/format'

/**
 * Customers Table Component
 *
 * Displays customers with balance and transaction info
 */

interface CustomerRow {
  id?: string
  name: string
  phone?: string | null
  balance: number
  _count?: { sales?: number; payments?: number }
  sales?: Array<{ totalAmount: number; createdAt: string }>
}

interface CustomersTableProps {
  customers: CustomerRow[]
  onCustomerClick?: (customer: CustomerRow) => void
}

export function CustomersTable({ customers, onCustomerClick }: CustomersTableProps) {
  const columns: Column<CustomerRow>[] = [
    {
      key: 'name',
      label: 'Customer Name',
      sortable: true,
      render: (customer) => (
        <div>
          <div className="font-medium text-gray-900">{customer.name}</div>
          {customer.phone && (
            <div className="text-xs text-gray-500">{customer.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: 'balance',
      label: 'Balance',
      sortable: true,
      render: (customer) => (
        <span
          className={`font-semibold ${
            customer.balance > 0 ? 'text-red-600' : 'text-green-600'
          }`}
        >
          {formatCurrency(customer.balance)}
        </span>
      ),
      className: 'text-right',
    },
    {
      key: '_count',
      label: 'Total Sales',
      sortable: true,
      render: (customer) => (
        <span className="text-gray-600">
          {customer._count?.sales || 0}
        </span>
      ),
      className: 'text-center',
    },
    {
      key: 'totalPurchases',
      label: 'Total Amount',
      sortable: true,
      render: (customer) => {
        const total = customer.sales?.reduce(
          (sum: number, sale: { totalAmount: number }) => sum + sale.totalAmount,
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
      render: (customer) => (
        <span className="text-gray-600">
          {customer._count?.payments || 0}
        </span>
      ),
      className: 'text-center',
    },
    {
      key: 'lastSale',
      label: 'Last Sale',
      sortable: true,
      render: (customer) => {
        const lastSale = customer.sales?.[0]
        return lastSale ? (
          <span className="text-xs text-gray-500">
            {formatDate(lastSale.createdAt)}
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
      render: (customer) => {
        if (customer.balance > 0) {
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 -full text-xs font-medium bg-red-100 text-red-800">
              Debtor
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
      data={customers}
      columns={columns}
      searchPlaceholder="Search customers by name, phone..."
      emptyMessage="No customers found"
      onRowClick={onCustomerClick}
    />
  )
}
