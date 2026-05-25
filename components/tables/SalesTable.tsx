'use client'

import { DataTable, Column } from './DataTable'
import { SaleWithDetails } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'

/**
 * Sales Table Component
 *
 * Displays sales data with customer, total, payment status
 */

interface SalesTableProps {
  sales: SaleWithDetails[]
  onSaleClick?: (sale: SaleWithDetails) => void
}

export function SalesTable({ sales, onSaleClick }: SalesTableProps) {
  const columns: Column<SaleWithDetails>[] = [
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (sale) => formatDate(sale.createdAt),
    },
    {
      key: 'id',
      label: 'Sale ID',
      sortable: true,
      render: (sale) => (
        <span className="font-mono text-xs">{sale.id.slice(0, 8)}</span>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      sortable: true,
      render: (sale) => sale.customer?.name || 'Walk-in Customer',
    },
    {
      key: 'totalAmount',
      label: 'Total',
      sortable: true,
      render: (sale) => (
        <span className="font-semibold">{formatCurrency(sale.totalAmount)}</span>
      ),
      className: 'text-right',
    },
    {
      key: 'paidAmount',
      label: 'Paid',
      sortable: true,
      render: (sale) => formatCurrency(sale.paidAmount),
      className: 'text-right',
    },
    {
      key: 'creditAmount',
      label: 'Credit',
      sortable: true,
      render: (sale) => {
        const creditAmount = sale.totalAmount - sale.paidAmount
        return (
          <span className={creditAmount > 0 ? 'text-red-600 font-medium' : ''}>
            {formatCurrency(creditAmount)}
          </span>
        )
      },
      className: 'text-right',
    },
    {
      key: 'items',
      label: 'Items',
      sortable: true,
      render: (sale) => (
        <span className="text-gray-600">{sale.items?.length || 0}</span>
      ),
      className: 'text-center',
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (sale) => {
        const creditAmount = sale.totalAmount - sale.paidAmount
        if (creditAmount === 0) {
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 -full text-xs font-medium bg-green-100 text-green-800">
              Paid
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 -full text-xs font-medium bg-yellow-100 text-yellow-800">
            Partial
          </span>
        )
      },
    },
  ]

  return (
    <DataTable
      data={sales}
      columns={columns}
      searchPlaceholder="Search sales by customer, ID..."
      emptyMessage="No sales found"
      onRowClick={onSaleClick}
    />
  )
}
