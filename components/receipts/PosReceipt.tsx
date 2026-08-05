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
// Physical geometry of the paper, in millimetres.
//
// A thermal head cannot print to the very edge: an 80mm roll has roughly 72mm
// of printable width, 58mm has about 48mm. Sizing to the full paper width is
// what left the content looking small and inset — the type was scaled for
// 80mm but only ~72mm of it was ever inked.
const PAPER = {
  '80mm': { printable: 72, cols: 42 },
  '58mm': { printable: 48, cols: 32 },
} as const

export function PosReceipt({ data, width = '80mm' }: PosReceiptProps) {
  const paper = PAPER[width]

  // Type is derived from the paper, not chosen by eye. Courier advances 0.6em
  // per character, so the size that fits N columns across the printable width
  // is (printable / cols) / 0.6. Everything else is a multiple of that, which
  // keeps one scale for type and spacing — previously type was in pt and
  // padding in mm, so they did not grow together.
  const charMm = paper.printable / paper.cols
  const base = charMm / 0.6
  const mm = (n: number) => `${Number(n.toFixed(3))}mm`
  const size = (mult: number) => mm(base * mult)

  const rule = { borderTop: '0.3mm dashed #000' } as const
  const solid = { borderTop: '0.4mm solid #000' } as const
  const row: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: mm(base * 0.5),
  }

  const discount = data.orderDiscount ?? 0
  const taxLines = data.taxLines ?? []
  const tendered = data.paidAmount + data.change

  return (
    <div
      className="thermal-receipt"
      // Width is set here for the on-screen preview only. In print the
      // stylesheet re-asserts it with !important, because that is the only
      // place that knows the paper actually loaded.
      style={{
        width: mm(paper.printable),
        maxWidth: mm(paper.printable),
        margin: '0 auto',
        background: '#fff',
        color: '#000',
        fontFamily: "'Courier New', ui-monospace, monospace",
        fontSize: size(1),
        lineHeight: 1.3,
        padding: 0,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', paddingBottom: mm(base * 0.6) }}>
        <div style={{ fontWeight: 700, fontSize: size(1.45), lineHeight: 1.15 }}>
          {data.businessName.toUpperCase()}
        </div>
        {data.branchName && <div>{data.branchName}</div>}
        {data.businessPhone && <div>{data.businessPhone}</div>}
        <div style={{ marginTop: mm(base * 0.3), fontWeight: 700 }}>SALES RECEIPT</div>
      </div>

      {/* Meta */}
      <div style={{ ...rule, paddingTop: mm(base * 0.4), paddingBottom: mm(base * 0.4) }}>
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
      <div style={{ ...solid, paddingTop: mm(base * 0.4) }}>
        {data.items.map((line, i) => (
          <div key={i} style={{ marginBottom: mm(base * 0.4) }}>
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
      <div style={{ ...solid, paddingTop: mm(base * 0.4) }}>
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
            marginTop: mm(base * 0.4),
            paddingTop: mm(base * 0.4),
            fontWeight: 700,
            fontSize: size(1.25),
          }}
        >
          <span>TOTAL</span>
          <span>{formatCurrency(data.total)}</span>
        </div>
      </div>

      {/* Payment */}
      <div style={{ ...rule, marginTop: mm(base * 0.4), paddingTop: mm(base * 0.4) }}>
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
        <div style={{ ...rule, marginTop: mm(base * 0.4), paddingTop: mm(base * 0.4), wordBreak: 'break-word' }}>
          Note: {data.note}
        </div>
      )}

      {/* Footer. Nothing here is set below the base size — a thermal head at
          203dpi cannot resolve type much under 8pt, and the developer credit
          that used to sit here at 0.75x printed as an unreadable smudge. */}
      <div style={{ ...solid, marginTop: mm(base * 0.6), paddingTop: mm(base * 0.5), textAlign: 'center' }}>
        <div style={{ fontWeight: 700 }}>THANK YOU!</div>
        <div>{data.footerNote ?? 'Please come again'}</div>
      </div>

      {/* Blank tail so the cutter clears the last line — print only. */}
      <div className="receipt-feed hidden" aria-hidden="true" />
    </div>
  )
}
