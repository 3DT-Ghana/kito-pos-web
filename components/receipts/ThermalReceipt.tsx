'use client'

import { formatCurrency } from '@/lib/utils/format'
import { formatTaxLabel } from '@/lib/tax/summary'

interface ReceiptItem {
  name: string
  manufacturer?: {
    name: string
  }
  quantity: number
  price: number
  total: number
}

interface ReceiptData {
  receiptNumber: string
  date: string
  time: string
  tenantName: string
  /** Branch the sale was made in — which till issued this receipt. */
  branchName?: string
  tenantPhone?: string
  customerName?: string
  items: ReceiptItem[]
  subtotal: number
  discount?: number
  taxLines?: {
    taxRateId?: string | null
    taxName: string
    taxRatePercentage: number
    taxAmount: number
  }[]
  total: number
  paidAmount: number
  change: number
  paymentType: string
  showManufacturer?: boolean
}

interface ThermalReceiptProps {
  data: ReceiptData
  width?: '58mm' | '80mm'
}

/**
 * Thermal Receipt Component
 *
 * Optimized for 58mm and 80mm thermal receipt printers
 * Features:
 * - Compact design for small paper width
 * - Clear, readable text
 * - Optional manufacturer display
 * - Print-ready CSS
 */
export function ThermalReceipt({ data, width = '80mm' }: ThermalReceiptProps) {
  const is58mm = width === '58mm'
  const maxWidth = is58mm ? '58mm' : '80mm'
  const fontSize = is58mm ? '10px' : '12px'

  // Page geometry is smartPrint's alone. This component used to inject its own
  // @page on mount, which meant two rules could exist at once and the browser
  // picked between them by source order rather than by what was printing. It
  // also set printing-receipt while merely *visible*, so a report printed from
  // a page showing a receipt inherited the receipt's page size.

  return (
    <div
      className="thermal-receipt bg-white text-black font-mono"
      style={{
        width: maxWidth,
        maxWidth: maxWidth,
        fontSize: fontSize,
        lineHeight: '1.4',
        padding: '8px',
      }}
    >
      {/* Business Header */}
      <div className="text-center border-b-2 border-black pb-2 mb-2">
        <div className="font-bold" style={{ fontSize: is58mm ? '14px' : '16px' }}>
          {data.tenantName.toUpperCase()}
        </div>
        {data.branchName && <div>{data.branchName}</div>}
        {data.tenantPhone && (
          <div className="mt-1">{data.tenantPhone}</div>
        )}
      </div>

      {/* Receipt Info */}
      <div className="mb-2 text-center">
        <div className="font-bold">SALES RECEIPT</div>
        <div className="mt-1">#{data.receiptNumber}</div>
        <div>{data.date} {data.time}</div>
      </div>

      {/* Customer */}
      {data.customerName && (
        <div className="mb-2">
          <div>Customer: {data.customerName}</div>
        </div>
      )}

      {/* Items */}
      <div className="border-t-2 border-black pt-2 mb-2">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="border-b border-dashed border-black">
              <th className="text-left pb-1" style={{ width: is58mm ? '50%' : '55%' }}>ITEM</th>
              <th className="text-center pb-1" style={{ width: '15%' }}>QTY</th>
              <th className="text-right pb-1" style={{ width: is58mm ? '35%' : '30%' }}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={index} className="border-b border-dashed border-gray-400">
                <td className="py-1 align-top">
                  <div className="font-semibold">
                    {item.name}
                  </div>
                  {data.showManufacturer && item.manufacturer && (
                    <div className="text-gray-600" style={{ fontSize: is58mm ? '9px' : '10px' }}>
                      ({item.manufacturer.name})
                    </div>
                  )}
                  <div style={{ fontSize: is58mm ? '9px' : '10px' }}>
                    @{formatCurrency(item.price)}
                  </div>
                </td>
                <td className="text-center py-1 align-top">
                  {item.quantity}
                </td>
                <td className="text-right py-1 align-top font-semibold">
                  {formatCurrency(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="border-t-2 border-black pt-2 mb-2">
        <div className="flex justify-between">
          <span>SUBTOTAL:</span>
          <span className="font-bold">{formatCurrency(data.subtotal)}</span>
        </div>
        {data.discount && data.discount > 0 && (
          <div className="flex justify-between">
            <span>DISCOUNT:</span>
            <span className="font-bold">-{formatCurrency(data.discount)}</span>
          </div>
        )}
        {(data.taxLines ?? []).map((taxLine) => (
          <div
            key={`${taxLine.taxRateId ?? taxLine.taxName}-${taxLine.taxRatePercentage}`}
            className="flex justify-between"
          >
            <span>{formatTaxLabel(taxLine).toUpperCase()}:</span>
            <span className="font-bold">{formatCurrency(taxLine.taxAmount)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold border-t border-dashed border-black mt-1 pt-1" style={{ fontSize: is58mm ? '12px' : '14px' }}>
          <span>TOTAL:</span>
          <span>{formatCurrency(data.total)}</span>
        </div>
      </div>

      {/* Payment */}
      <div className="border-t border-dashed border-black pt-2 mb-2">
        <div className="flex justify-between">
          <span>PAYMENT ({data.paymentType}):</span>
          <span>{formatCurrency(data.paidAmount)}</span>
        </div>
        {data.change > 0 && (
          <div className="flex justify-between font-bold">
            <span>CHANGE:</span>
            <span>{formatCurrency(data.change)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t-2 border-black pt-2 text-center">
        <div className="font-bold">THANK YOU!</div>
        <div className="mt-1" style={{ fontSize: is58mm ? '9px' : '10px' }}>
          Please come again
        </div>
      </div>

      {/* Blank tail so the cutter clears the last line — print only. */}
      <div className="receipt-feed hidden" aria-hidden="true" />

      {/* Print styles. A plain <style> rather than styled-jsx: styled-jsx
          rewrites selectors for component scoping, which stops these rules
          from matching the document-level elements they target (body, and
          the visibility reset over every other node on the page). */}
      <style>{`
        @media print {
          .thermal-receipt {
            width: ${maxWidth};
            max-width: ${maxWidth};
            margin: 0;
            padding: 8px;
          }

          /* @page lives in the injected head style — see the effect above.
             Declaring it here too left two competing rules whose winner
             depended on stylesheet order. */

          body {
            margin: 0;
            padding: 0;
          }

          /* Hide everything except receipt */
          body * {
            visibility: hidden;
          }

          .thermal-receipt,
          .thermal-receipt * {
            visibility: visible;
          }

          .thermal-receipt {
            position: absolute;
            left: 0;
            top: 0;
          }
        }
      `}</style>
    </div>
  )
}

/**
 * Print Receipt Function — prints via the browser; silent when the till runs
 * with --kiosk-printing, otherwise the print dialog appears.
 */
export async function printReceipt() {
  if (typeof window === 'undefined') return
  const { smartPrint } = await import('@/lib/print/print')
  await smartPrint('receipt', document.querySelector('.thermal-receipt') as HTMLElement | null)
}
