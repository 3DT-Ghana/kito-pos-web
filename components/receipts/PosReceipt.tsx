'use client'

import { formatCurrency } from '@/lib/utils/format'
import { formatTaxLabel } from '@/lib/tax/summary'

export interface PosReceiptLine {
  name: string
  qty: number
  unitPrice: number
  lineTotal: number
  lineTaxAmount?: number
}

export interface PosReceiptTaxLine {
  taxRateId?: string | null
  taxName: string
  taxRatePercentage: number
  taxAmount: number
}

export interface PosReceiptData {
  receiptNumber: string
  date: string
  time: string
  /** Shop or branch name shown as the receipt header. */
  businessName: string
  /** Branch name, shown under the shop name when branches are in use. */
  branchName?: string
  businessPhone?: string
  cashierName?: string
  customerName?: string
  items: PosReceiptLine[]
  subtotal: number
  orderDiscount?: number
  taxLines?: PosReceiptTaxLine[]
  total: number
  paidAmount: number
  change: number
  paymentMethod: string
  note?: string
  footerNote?: string
}

interface PosReceiptProps {
  data: PosReceiptData
  width?: '58mm' | '80mm'
}

/**
 * POS sale receipt.
 *
 * One template for the receipt shown after a sale and the one that goes to the
 * thermal printer, so what the cashier sees on screen is what the customer is
 * handed. Previously the POS built this markup inline and it drifted from the
 * printed version.
 *
 * Styling is deliberately plain: pure black on white, no greys and no colour.
 * Thermal printers are single-colour, so a grey subtotal renders as faint dots
 * or vanishes, and a green discount prints no differently from black — the
 * on-screen colours simply cost legibility on paper.
 */
export function PosReceipt({ data, width = '80mm' }: PosReceiptProps) {
  const is58 = width === '58mm'
  // Sized in pt, not px. A pt is an absolute 1/72in, so the printer driver
  // reproduces it at true physical size; px is a CSS unit the driver is free to
  // rescale when it fits the page to the roll, which is what made the receipt
  // print tiny. 9pt Courier gives ~42 characters across 80mm — close to the
  // 48-column native font of a 203dpi thermal head.
  const base = is58 ? 7.5 : 9
  const pt = (n: number) => `${n}pt`

  const rule = { borderTop: '1px dashed #000' } as const
  const solid = { borderTop: '1px solid #000' } as const
  const row: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '2mm',
  }

  const discount = data.orderDiscount ?? 0
  const taxLines = data.taxLines ?? []
  const tendered = data.paidAmount + data.change

  return (
    <div
      className="thermal-receipt"
      style={{
        width,
        maxWidth: width,
        background: '#fff',
        color: '#000',
        fontFamily: "'Courier New', ui-monospace, monospace",
        fontSize: pt(base),
        lineHeight: 1.35,
        padding: '2mm 1.5mm',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', paddingBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: pt(base + 4), letterSpacing: 0.5 }}>
          {data.businessName.toUpperCase()}
        </div>
        {data.branchName && <div>{data.branchName}</div>}
        {data.businessPhone && <div>{data.businessPhone}</div>}
        <div style={{ marginTop: 3, fontWeight: 700 }}>SALES RECEIPT</div>
      </div>

      {/* Meta */}
      <div style={{ ...rule, paddingTop: 4, paddingBottom: 4 }}>
        <div style={row}>
          <span>Receipt</span>
          <span>#{data.receiptNumber}</span>
        </div>
        <div style={row}>
          <span>Date</span>
          <span>{data.date} {data.time}</span>
        </div>
        {data.cashierName && (
          <div style={row}>
            <span>Served by</span>
            <span>{data.cashierName}</span>
          </div>
        )}
        {data.customerName && (
          <div style={row}>
            <span>Customer</span>
            <span>{data.customerName}</span>
          </div>
        )}
      </div>

      {/* Items */}
      <div style={{ ...solid, paddingTop: 4 }}>
        {data.items.map((line, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{line.name}</div>
            <div style={row}>
              <span>
                {line.qty} x {formatCurrency(line.unitPrice)}
                {line.lineTaxAmount && line.lineTaxAmount > 0
                  ? ` (tax ${formatCurrency(line.lineTaxAmount)})`
                  : ''}
              </span>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                {formatCurrency(line.lineTotal)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ ...solid, paddingTop: 4 }}>
        <div style={row}>
          <span>Subtotal</span>
          <span>{formatCurrency(data.subtotal)}</span>
        </div>
        {discount > 0 && (
          <div style={row}>
            <span>Discount</span>
            <span>-{formatCurrency(discount)}</span>
          </div>
        )}
        {taxLines.map((taxLine) => (
          <div key={`${taxLine.taxRateId ?? taxLine.taxName}-${taxLine.taxRatePercentage}`} style={row}>
            <span>{formatTaxLabel(taxLine)}</span>
            <span>{formatCurrency(taxLine.taxAmount)}</span>
          </div>
        ))}
        <div
          style={{
            ...row,
            ...solid,
            marginTop: 4,
            paddingTop: 4,
            fontWeight: 700,
            fontSize: pt(base + 2),
          }}
        >
          <span>TOTAL</span>
          <span>{formatCurrency(data.total)}</span>
        </div>
      </div>

      {/* Payment */}
      <div style={{ ...rule, marginTop: 4, paddingTop: 4 }}>
        <div style={row}>
          <span>Paid ({data.paymentMethod})</span>
          <span>{formatCurrency(data.paidAmount)}</span>
        </div>
        {data.change > 0 && (
          <>
            <div style={row}>
              <span>Tendered</span>
              <span>{formatCurrency(tendered)}</span>
            </div>
            <div style={{ ...row, fontWeight: 700 }}>
              <span>CHANGE</span>
              <span>{formatCurrency(data.change)}</span>
            </div>
          </>
        )}
      </div>

      {data.note && (
        <div style={{ ...rule, marginTop: 4, paddingTop: 4, wordBreak: 'break-word' }}>
          Note: {data.note}
        </div>
      )}

      {/* Footer */}
      <div style={{ ...solid, marginTop: 6, paddingTop: 5, textAlign: 'center' }}>
        <div style={{ fontWeight: 700 }}>THANK YOU!</div>
        <div>{data.footerNote ?? 'Please come again'}</div>
        <div style={{ marginTop: 5, fontSize: pt(base - 3) }}>
          System Developed EYO Solutions | 0246462398
        </div>
      </div>

      {/* Blank tail so the cutter clears the last line — print only. */}
      <div className="receipt-feed hidden" aria-hidden="true" />
    </div>
  )
}
