'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LabelItem {
  id: string
  name: string
  barcode: string | null
  sellingPrice: number
  category?: { name: string; color: string | null } | null
}

type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPCA' | 'CODE39'
type QrEcc = 'L' | 'M' | 'Q' | 'H'
type CodeType = 'barcode' | 'qr'
type LabelSize = 'small' | 'medium' | 'large' | 'custom'
type PaperSize = 'A4' | 'letter' | 'thermal80' | 'thermal58'

interface LabelConfig {
  codeType: CodeType
  // barcode options
  barcodeFormat: BarcodeFormat
  // qr options
  qrEcc: QrEcc
  // label content
  showName: boolean
  showPrice: boolean
  showCategory: boolean
  showCodeText: boolean   // human-readable text below barcode (in addition to JsBarcode displayValue)
  // label dimensions
  size: LabelSize
  customW: number         // mm, only used when size === 'custom'
  customH: number         // mm
  // print layout
  paperSize: PaperSize
  columns: number         // labels per row
}

// ─── Barcode format metadata ──────────────────────────────────────────────────

interface FormatMeta {
  label: string
  description: string
  example: string
  validate: (v: string) => string | null   // returns error string or null if valid
  jsFormat: string                          // JsBarcode format string
  autoGenerate: () => string               // generate a valid value when item has no barcode
}

function ean13Check(digits11: string): string {
  const d = digits11.split('').map(Number)
  const sum = d.reduce((s, n, i) => s + n * (i % 2 === 0 ? 1 : 3), 0)
  return String((10 - (sum % 10)) % 10)
}

function upcACheck(digits11: string): string {
  const d = digits11.split('').map(Number)
  const sum = d.reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0)
  return String((10 - (sum % 10)) % 10)
}

function ean8Check(digits7: string): string {
  const d = digits7.split('').map(Number)
  const sum = d.reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0)
  return String((10 - (sum % 10)) % 10)
}

let _seq = Date.now() % 100000

function seqPad(n: number, len: number) { return String(n).padStart(len, '0') }

const FORMAT_META: Record<BarcodeFormat, FormatMeta> = {
  CODE128: {
    label: 'Code 128',
    description: 'Most versatile — supports letters, numbers, and symbols. Best for internal products.',
    example: 'ABC-123456',
    jsFormat: 'CODE128',
    validate: v => {
      if (!v || v.length < 1) return 'Value required'
      // Code128 supports ASCII 0-127
      if ([...v].some(c => c.charCodeAt(0) > 127)) return 'Code 128 supports ASCII characters only'
      return null
    },
    autoGenerate: () => `ITM${seqPad(++_seq, 8)}`,
  },
  EAN13: {
    label: 'EAN-13',
    description: 'Global retail standard (13 digits). Used for products sold in supermarkets worldwide.',
    example: '5901234123457',
    jsFormat: 'EAN13',
    validate: v => {
      if (!/^\d{12,13}$/.test(v)) return 'EAN-13 requires 12 or 13 digits'
      if (v.length === 13) {
        const check = ean13Check(v.slice(0, 12))
        if (check !== v[12]) return `Check digit should be ${check} (got ${v[12]})`
      }
      return null
    },
    autoGenerate: () => {
      const base = `200${seqPad(++_seq, 9)}`
      return base + ean13Check(base)
    },
  },
  EAN8: {
    label: 'EAN-8',
    description: 'Compact retail barcode (8 digits). For small packages where EAN-13 won\'t fit.',
    example: '96385074',
    jsFormat: 'EAN8',
    validate: v => {
      if (!/^\d{7,8}$/.test(v)) return 'EAN-8 requires 7 or 8 digits'
      if (v.length === 8) {
        const check = ean8Check(v.slice(0, 7))
        if (check !== v[7]) return `Check digit should be ${check} (got ${v[7]})`
      }
      return null
    },
    autoGenerate: () => {
      const base = `20${seqPad(++_seq % 10000, 5)}`
      return base + ean8Check(base)
    },
  },
  UPCA: {
    label: 'UPC-A',
    description: '12-digit US/Canada retail standard. Compatible with all major POS scanners.',
    example: '012345678905',
    jsFormat: 'UPC',
    validate: v => {
      if (!/^\d{11,12}$/.test(v)) return 'UPC-A requires 11 or 12 digits'
      if (v.length === 12) {
        const check = upcACheck(v.slice(0, 11))
        if (check !== v[11]) return `Check digit should be ${check} (got ${v[11]})`
      }
      return null
    },
    autoGenerate: () => {
      const base = `0${seqPad(++_seq, 10)}`
      return base + upcACheck(base)
    },
  },
  CODE39: {
    label: 'Code 39',
    description: 'Older industrial standard. Supported by almost every scanner. Uppercase letters and digits only.',
    example: 'ITEM-001',
    jsFormat: 'CODE39',
    validate: v => {
      if (!v || v.length < 1) return 'Value required'
      if (!/^[A-Z0-9 \-.$/+%]+$/.test(v.toUpperCase())) return 'Code 39: uppercase A-Z, 0-9, and - . $ / + % space only'
      return null
    },
    autoGenerate: () => `ITM-${seqPad(++_seq, 6)}`,
  },
}

// ─── Label size presets ───────────────────────────────────────────────────────

const SIZE_PRESETS: Record<Exclude<LabelSize, 'custom'>, { label: string; desc: string; w: number; h: number }> = {
  small:  { label: '38 × 25 mm', desc: 'Jewellery / small items',     w: 38,  h: 25 },
  medium: { label: '58 × 40 mm', desc: 'Standard shelf label',        w: 58,  h: 40 },
  large:  { label: '100 × 50 mm', desc: 'Outer carton / large items',  w: 100, h: 50 },
}

const PAPER_SIZES: Record<PaperSize, { label: string; w: string; h: string }> = {
  A4:        { label: 'A4 (210 × 297 mm)',           w: '210mm', h: '297mm' },
  letter:    { label: 'US Letter (216 × 279 mm)',     w: '216mm', h: '279mm' },
  thermal80: { label: 'Thermal 80 mm roll',           w: '80mm',  h: 'auto'  },
  thermal58: { label: 'Thermal 58 mm roll',           w: '58mm',  h: 'auto'  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function effectiveSize(config: LabelConfig): { w: number; h: number } {
  if (config.size === 'custom') return { w: config.customW, h: config.customH }
  return { w: SIZE_PRESETS[config.size].w, h: SIZE_PRESETS[config.size].h }
}

function codeValueFor(item: LabelItem, format: BarcodeFormat, perItemCodes: Record<string, string>): string {
  return perItemCodes[item.id] || item.barcode || FORMAT_META[format].autoGenerate()
}

// ─── Single label preview ────────────────────────────────────────────────────

interface PreviewProps {
  item: LabelItem
  config: LabelConfig
  codeValue: string
}

function LabelPreview({ item, config, codeValue }: PreviewProps) {
  const barcodeRef = useRef<SVGSVGElement>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const { w, h } = effectiveSize(config)
  const meta = FORMAT_META[config.barcodeFormat]

  const validationError = config.codeType === 'barcode' ? meta.validate(codeValue) : null

  // Scale for screen: aim for ~220px wide minimum
  const scale = Math.max(2.2, Math.min(4, 220 / w))
  const pxW = Math.round(w * scale)
  const pxH = Math.round(h * scale)

  // Barcode height: leave room for name + price rows
  const reservedPx = (config.showName ? 16 : 0) + (config.showPrice || config.showCategory ? 14 : 0)
  const barcodeHeightPx = Math.max(24, pxH - reservedPx - 12)

  useEffect(() => {
    if (config.codeType !== 'barcode' || !barcodeRef.current || validationError) return
    try {
      JsBarcode(barcodeRef.current, codeValue, {
        format: meta.jsFormat,
        width: Math.max(1, scale * 0.4),
        height: barcodeHeightPx,
        displayValue: config.showCodeText,
        fontSize: Math.max(7, scale * 2.2),
        margin: Math.round(scale * 1),
        background: '#ffffff',
        lineColor: '#000000',
      })
    } catch { /* validation should catch first */ }
  }, [codeValue, config.codeType, config.barcodeFormat, config.showCodeText, scale, barcodeHeightPx, validationError, meta.jsFormat])

  useEffect(() => {
    if (config.codeType !== 'qr' || !qrCanvasRef.current) return
    const eccMap: Record<QrEcc, QRCode.QRCodeErrorCorrectionLevel> = { L: 'L', M: 'M', Q: 'Q', H: 'H' }
    const qrSize = Math.max(40, pxH - reservedPx - 10)
    QRCode.toCanvas(qrCanvasRef.current, codeValue || ' ', {
      width: qrSize,
      margin: 1,
      errorCorrectionLevel: eccMap[config.qrEcc],
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {})
  }, [codeValue, config.codeType, config.qrEcc, pxH, reservedPx])

  const nameFontPx = Math.max(7, Math.min(12, scale * 2.5))
  const metaFontPx = Math.max(6, Math.min(10, scale * 2))

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="bg-white border-2 border-gray-300 shadow-md flex flex-col overflow-hidden"
        style={{ width: pxW, height: pxH, padding: Math.round(scale * 1.5), boxSizing: 'border-box', gap: 2 }}
      >
        {config.showName && (
          <p className="font-bold text-black leading-tight text-center w-full"
            style={{ fontSize: nameFontPx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name}
          </p>
        )}

        <div className="flex-1 flex items-center justify-center min-h-0">
          {validationError ? (
            <div className="text-center px-2">
              <p className="text-red-500 font-bold" style={{ fontSize: Math.max(7, scale * 1.8) }}>⚠</p>
              <p className="text-red-500" style={{ fontSize: Math.max(6, scale * 1.6), lineHeight: 1.2 }}>{validationError}</p>
            </div>
          ) : config.codeType === 'barcode' ? (
            <svg ref={barcodeRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
          ) : (
            <canvas ref={qrCanvasRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
          )}
        </div>

        {(config.showPrice || config.showCategory) && (
          <div className="flex items-center justify-between w-full shrink-0" style={{ gap: 2 }}>
            {config.showPrice && (
              <span className="font-bold text-black shrink-0" style={{ fontSize: metaFontPx }}>
                GHS {item.sellingPrice.toFixed(2)}
              </span>
            )}
            {config.showCategory && item.category && (
              <span className="font-semibold truncate" style={{ fontSize: metaFontPx - 1, color: item.category.color ?? '#6366f1' }}>
                {item.category.name}
              </span>
            )}
          </div>
        )}
      </div>

      {validationError && (
        <p className="text-xs text-red-500 font-semibold text-center max-w-55">{validationError}</p>
      )}
    </div>
  )
}

// ─── Print sheet builder ──────────────────────────────────────────────────────

async function buildPrintHTML(
  items: LabelItem[],
  perItemQty: Record<string, number>,
  perItemCodes: Record<string, string>,
  config: LabelConfig,
): Promise<string> {
  const { w, h } = effectiveSize(config)
  const meta = FORMAT_META[config.barcodeFormat]
  const paper = PAPER_SIZES[config.paperSize]
  const eccMap: Record<QrEcc, string> = { L: 'L', M: 'M', Q: 'Q', H: 'H' }

  const labelHTMLs: string[] = []

  for (const item of items) {
    const qty = perItemQty[item.id] ?? 1
    const codeValue = codeValueFor(item, config.barcodeFormat, perItemCodes)
    const validErr = config.codeType === 'barcode' ? meta.validate(codeValue) : null

    let codeHTML = ''
    if (validErr) {
      codeHTML = `<div style="font-size:7pt;color:red;text-align:center;">⚠ ${validErr}</div>`
    } else if (config.codeType === 'qr') {
      // Use higher pixel density for print quality
      const qrDataUrl = await QRCode.toDataURL(codeValue, {
        width: Math.round(w * 11.81 * 0.7),   // 300 dpi equivalent
        margin: 2,
        errorCorrectionLevel: eccMap[config.qrEcc] as QRCode.QRCodeErrorCorrectionLevel,
        color: { dark: '#000000', light: '#ffffff' },
      })
      codeHTML = `<img src="${qrDataUrl}" style="display:block;max-width:100%;max-height:${h * 0.6}mm;margin:0 auto;" />`
    } else {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      try {
        JsBarcode(svgEl, codeValue, {
          format: meta.jsFormat,
          width: w < 50 ? 1.2 : 1.5,
          height: Math.round((h - (config.showName ? 5 : 0) - (config.showPrice || config.showCategory ? 4 : 0)) * 2.835 - 8),
          displayValue: config.showCodeText,
          fontSize: w < 50 ? 6 : 8,
          margin: 3,
          background: '#ffffff',
          lineColor: '#000000',
          xmlDocument: document,
        })
        codeHTML = `<div style="text-align:center;">${svgEl.outerHTML}</div>`
      } catch {
        codeHTML = `<div style="font-size:7pt;text-align:center;font-family:monospace;">${codeValue}</div>`
      }
    }

    const nameFontPt = w < 50 ? 5.5 : 7
    const metaFontPt = w < 50 ? 5 : 6.5

    const labelHTML = `<div class="label" style="
      width:${w}mm; height:${h}mm;
      display:flex; flex-direction:column;
      align-items:center; justify-content:space-between;
      padding:1.2mm 1.5mm; box-sizing:border-box; overflow:hidden;
      page-break-inside:avoid; break-inside:avoid;
    ">
      ${config.showName ? `<p style="font-size:${nameFontPt}pt;font-weight:700;margin:0;text-align:center;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Arial,sans-serif;">${escapeHtml(item.name)}</p>` : ''}
      <div style="flex:1;display:flex;align-items:center;justify-content:center;width:100%;min-height:0;">${codeHTML}</div>
      ${(config.showPrice || config.showCategory) ? `
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:1mm;">
          ${config.showPrice ? `<span style="font-size:${metaFontPt}pt;font-weight:700;font-family:Arial,sans-serif;">GHS ${item.sellingPrice.toFixed(2)}</span>` : ''}
          ${config.showCategory && item.category ? `<span style="font-size:${metaFontPt - 0.5}pt;font-weight:600;color:${item.category.color ?? '#6366f1'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Arial,sans-serif;">${escapeHtml(item.category.name)}</span>` : ''}
        </div>` : ''}
    </div>`

    for (let q = 0; q < qty; q++) labelHTMLs.push(labelHTML)
  }

  const isRoll = config.paperSize === 'thermal80' || config.paperSize === 'thermal58'
  const colGap = 0        // zero gap — labels butt up against each other for clean cutting
  const rowGap = 0
  const pagePadding = isRoll ? '2mm' : '8mm'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Barcode Labels</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; }
  @page {
    size: ${paper.w} ${paper.h};
    margin: 0;
  }
  .sheet {
    display: grid;
    grid-template-columns: repeat(${config.columns}, ${w}mm);
    column-gap: ${colGap}mm;
    row-gap: ${rowGap}mm;
    padding: ${pagePadding};
    justify-content: ${isRoll ? 'center' : 'start'};
  }
  .label { border: 0.3pt solid #d1d5db; }
  @media print {
    body { margin: 0; }
    .sheet { padding: ${isRoll ? '1mm' : '6mm'}; }
  }
</style>
</head>
<body>
<div class="sheet">
${labelHTMLs.join('\n')}
</div>
</body>
</html>`
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Barcode value editor row ─────────────────────────────────────────────────

function ItemCodeRow({
  item,
  format,
  value,
  onChange,
  qty,
  onQtyChange,
  isPreview,
  onSelect,
}: {
  item: LabelItem
  format: BarcodeFormat
  value: string
  onChange: (v: string) => void
  qty: number
  onQtyChange: (q: number) => void
  isPreview: boolean
  onSelect: () => void
}) {
  const meta = FORMAT_META[format]
  const err = meta.validate(value)

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer transition-colors ${
        isPreview ? 'border-indigo-400 bg-indigo-50' : err ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'
      }`}
    >
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${err ? 'bg-red-400' : 'bg-green-400'}`} />

      {/* Name + editable code */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-800 truncate leading-tight">{item.name}</p>
        <input
          type="text"
          value={value}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange(e.target.value)}
          placeholder={meta.example}
          className={`w-full text-xs font-mono border rounded-md px-1.5 py-0.5 mt-0.5 focus:outline-none focus:ring-1 ${
            err ? 'border-red-300 bg-red-50 focus:ring-red-400' : 'border-gray-200 bg-white focus:ring-indigo-400'
          }`}
        />
        {err && <p className="text-[10px] text-red-500 mt-0.5 leading-tight">{err}</p>}
      </div>

      {/* Qty stepper */}
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onQtyChange(Math.max(1, qty - 1))}
          className="w-5 h-5 rounded bg-white border border-gray-200 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100"
        >−</button>
        <input
          type="number"
          min={1}
          max={999}
          value={qty}
          onChange={e => onQtyChange(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-9 text-center border border-gray-200 rounded py-0.5 font-bold text-xs focus:outline-none focus:border-indigo-400"
        />
        <button
          onClick={() => onQtyChange(Math.min(999, qty + 1))}
          className="w-5 h-5 rounded bg-white border border-gray-200 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100"
        >+</button>
      </div>
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  items: LabelItem[]
  onClose: () => void
}

export function BarcodeGenerator({ items, onClose }: Props) {
  const [config, setConfig] = useState<LabelConfig>({
    codeType: 'barcode',
    barcodeFormat: 'CODE128',
    qrEcc: 'M',
    showName: true,
    showPrice: true,
    showCategory: false,
    showCodeText: true,
    size: 'medium',
    customW: 60,
    customH: 40,
    paperSize: 'A4',
    columns: 3,
  })

  // Per-item barcode values (seeded from item.barcode or auto-generated)
  const [perItemCodes, setPerItemCodes] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map(i => [i.id, i.barcode ?? '']))
  )

  // Per-item qty
  const [perItemQty, setPerItemQty] = useState<Record<string, number>>(
    () => Object.fromEntries(items.map(i => [i.id, 1]))
  )

  const [previewIdx, setPreviewIdx] = useState(0)
  const [isPrinting, setIsPrinting] = useState(false)
  const [activeTab, setActiveTab] = useState<'format' | 'layout' | 'items'>('format')

  const cfg = (patch: Partial<LabelConfig>) => setConfig(prev => ({ ...prev, ...patch }))

  const totalLabels = items.reduce((s, i) => s + (perItemQty[i.id] ?? 1), 0)

  // Auto-fill empty codes when format changes
  useEffect(() => {
    setPerItemCodes(prev => {
      const next = { ...prev }
      for (const item of items) {
        if (!next[item.id]) {
          next[item.id] = item.barcode ?? ''
        }
      }
      return next
    })
  }, [config.barcodeFormat, items])

  const generateAll = () => {
    const meta = FORMAT_META[config.barcodeFormat]
    setPerItemCodes(Object.fromEntries(items.map(i => [i.id, i.barcode ?? meta.autoGenerate()])))
  }

  const validCount = useMemo(() => {
    if (config.codeType === 'qr') return items.length
    const meta = FORMAT_META[config.barcodeFormat]
    return items.filter(i => !meta.validate(perItemCodes[i.id] ?? '')).length
  }, [config.codeType, config.barcodeFormat, perItemCodes, items])

  const previewItem = items[previewIdx] ?? items[0]
  const previewCode = previewItem
    ? codeValueFor(previewItem, config.barcodeFormat, perItemCodes)
    : ''

  const handlePrint = useCallback(async () => {
    setIsPrinting(true)
    try {
      const html = await buildPrintHTML(items, perItemQty, perItemCodes, config)
      const win = window.open('', '_blank', 'width=960,height=720')
      if (!win) { alert('Please allow pop-ups to print labels.'); return }
      win.document.write(html)
      win.document.close()
      win.focus()
      // Wait for images (QR codes) to load before printing
      setTimeout(() => win.print(), 800)
    } finally {
      setIsPrinting(false)
    }
  }, [items, perItemQty, perItemCodes, config])

  const { w, h } = effectiveSize(config)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[97vh] flex flex-col overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center text-lg">🏷️</div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Print Labels</h2>
              <p className="text-xs text-gray-500">
                {items.length} item{items.length !== 1 ? 's' : ''}
                {config.codeType === 'barcode' && ` · ${validCount}/${items.length} valid codes`}
                {` · ${totalLabels} label${totalLabels !== 1 ? 's' : ''} total`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">

          {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
          <div className="w-full lg:w-75 xl:w-[320px] shrink-0 flex flex-col border-r border-gray-100 overflow-hidden">

            {/* Tabs */}
            <div className="flex border-b border-gray-100 shrink-0">
              {(['format', 'layout', 'items'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-bold capitalize transition-colors border-b-2 ${
                    activeTab === tab
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab === 'format' ? '⚙ Format' : tab === 'layout' ? '📐 Layout' : `📋 Items (${items.length})`}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* ── FORMAT TAB ────────────────────────────────────────────── */}
              {activeTab === 'format' && (<>

                {/* Code type toggle */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Code Type</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['barcode', 'qr'] as CodeType[]).map(t => (
                      <button key={t} onClick={() => cfg({ codeType: t })}
                        className={`py-3 rounded-xl border-2 text-sm font-bold flex flex-col items-center gap-1.5 transition-all ${
                          config.codeType === t ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200' : 'border-gray-200 text-gray-500 hover:border-indigo-200'
                        }`}
                      >
                        {t === 'barcode'
                          ? <svg viewBox="0 0 40 20" className="w-10 h-5"><rect x="0" y="0" width="3" height="20" fill="currentColor"/><rect x="5" y="0" width="1" height="20" fill="currentColor"/><rect x="8" y="0" width="2" height="20" fill="currentColor"/><rect x="12" y="0" width="4" height="20" fill="currentColor"/><rect x="18" y="0" width="1" height="20" fill="currentColor"/><rect x="21" y="0" width="3" height="20" fill="currentColor"/><rect x="26" y="0" width="2" height="20" fill="currentColor"/><rect x="30" y="0" width="1" height="20" fill="currentColor"/><rect x="33" y="0" width="4" height="20" fill="currentColor"/></svg>
                          : <svg viewBox="0 0 20 20" className="w-5 h-5"><rect x="0" y="0" width="8" height="8" fill="currentColor"/><rect x="12" y="0" width="8" height="8" fill="currentColor"/><rect x="0" y="12" width="8" height="8" fill="currentColor"/><rect x="2" y="2" width="4" height="4" fill="white"/><rect x="14" y="2" width="4" height="4" fill="white"/><rect x="2" y="14" width="4" height="4" fill="white"/><rect x="10" y="10" width="2" height="2" fill="currentColor"/><rect x="14" y="12" width="6" height="2" fill="currentColor"/><rect x="12" y="14" width="2" height="6" fill="currentColor"/><rect x="16" y="16" width="4" height="4" fill="currentColor"/></svg>
                        }
                        <span>{t === 'barcode' ? 'Barcode' : 'QR Code'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Barcode format */}
                {config.codeType === 'barcode' && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Barcode Format</p>
                    <div className="space-y-1.5">
                      {(Object.entries(FORMAT_META) as [BarcodeFormat, FormatMeta][]).map(([fmt, meta]) => (
                        <button key={fmt} onClick={() => cfg({ barcodeFormat: fmt })}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                            config.barcodeFormat === fmt
                              ? 'border-indigo-400 bg-indigo-50'
                              : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm font-bold ${config.barcodeFormat === fmt ? 'text-indigo-800' : 'text-gray-700'}`}>{meta.label}</span>
                            {config.barcodeFormat === fmt && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-md">Selected</span>}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{meta.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* QR error correction */}
                {config.codeType === 'qr' && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Error Correction Level</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {([
                        { k: 'L', label: 'L', desc: '7%' },
                        { k: 'M', label: 'M', desc: '15%' },
                        { k: 'Q', label: 'Q', desc: '25%' },
                        { k: 'H', label: 'H', desc: '30%' },
                      ] as { k: QrEcc; label: string; desc: string }[]).map(({ k, label, desc }) => (
                        <button key={k} onClick={() => cfg({ qrEcc: k })}
                          className={`flex flex-col items-center py-2 rounded-xl border-2 text-xs font-bold transition-colors ${
                            config.qrEcc === k ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          <span className="font-black text-sm">{label}</span>
                          <span className="text-[9px] font-medium text-gray-400">{desc}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">Higher = more damage-resistant but denser QR. <strong>M</strong> is recommended for labels.</p>
                  </div>
                )}

                {/* Content toggles */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Label Content</p>
                  <div className="space-y-2">
                    {([
                      { key: 'showName',     label: 'Item name' },
                      { key: 'showPrice',    label: 'Price (GHS)' },
                      { key: 'showCategory', label: 'Category' },
                      ...(config.codeType === 'barcode' ? [{ key: 'showCodeText', label: 'Code text below barcode' }] : []),
                    ] as { key: keyof LabelConfig; label: string }[]).map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input type="checkbox"
                          checked={config[key] as boolean}
                          onChange={e => cfg({ [key]: e.target.checked })}
                          className="w-4 h-4 accent-indigo-600 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

              </>)}

              {/* ── LAYOUT TAB ────────────────────────────────────────────── */}
              {activeTab === 'layout' && (<>

                {/* Label size */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Label Size</p>
                  <div className="space-y-1.5">
                    {(Object.entries(SIZE_PRESETS) as [Exclude<LabelSize,'custom'>, typeof SIZE_PRESETS[Exclude<LabelSize,'custom'>]][]).map(([key, val]) => (
                      <button key={key} onClick={() => cfg({ size: key })}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all ${
                          config.size === key ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-left">
                          <p className={`text-sm font-bold capitalize ${config.size === key ? 'text-indigo-800' : 'text-gray-700'}`}>{key}</p>
                          <p className="text-[10px] text-gray-400">{val.desc}</p>
                        </div>
                        <span className={`text-xs font-semibold ${config.size === key ? 'text-indigo-600' : 'text-gray-400'}`}>{val.label}</span>
                      </button>
                    ))}
                    {/* Custom size */}
                    <button onClick={() => cfg({ size: 'custom' })}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all ${
                        config.size === 'custom' ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-left">
                        <p className={`text-sm font-bold ${config.size === 'custom' ? 'text-indigo-800' : 'text-gray-700'}`}>Custom</p>
                        <p className="text-[10px] text-gray-400">Enter exact dimensions</p>
                      </div>
                      <span className={`text-xs font-semibold ${config.size === 'custom' ? 'text-indigo-600' : 'text-gray-400'}`}>✏</span>
                    </button>
                  </div>
                  {config.size === 'custom' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[{label:'Width (mm)',key:'customW'},{label:'Height (mm)',key:'customH'}].map(({label,key}) => (
                        <div key={key}>
                          <p className="text-[10px] text-gray-500 mb-1">{label}</p>
                          <input type="number" min={10} max={200}
                            value={config[key as 'customW'|'customH']}
                            onChange={e => cfg({ [key]: Math.max(10, parseInt(e.target.value)||10) })}
                            className="w-full border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:border-indigo-400 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Paper size */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Paper / Roll Size</p>
                  <div className="space-y-1.5">
                    {(Object.entries(PAPER_SIZES) as [PaperSize, typeof PAPER_SIZES[PaperSize]][]).map(([key, val]) => (
                      <button key={key} onClick={() => cfg({ paperSize: key })}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                          config.paperSize === key ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <span>{key.startsWith('thermal') ? '🧻' : '📄'}</span>
                        <span>{val.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Columns per row */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Columns per Row</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => cfg({ columns: Math.max(1, config.columns - 1) })}
                      className="w-8 h-8 rounded-lg bg-gray-100 font-bold text-gray-700 flex items-center justify-center hover:bg-gray-200">−</button>
                    <input type="number" min={1} max={10} value={config.columns}
                      onChange={e => cfg({ columns: Math.max(1, Math.min(10, parseInt(e.target.value)||1)) })}
                      className="w-14 text-center border-2 border-gray-200 rounded-xl py-1.5 font-bold text-sm focus:border-indigo-400 focus:outline-none"
                    />
                    <button onClick={() => cfg({ columns: Math.min(10, config.columns + 1) })}
                      className="w-8 h-8 rounded-lg bg-gray-100 font-bold text-gray-700 flex items-center justify-center hover:bg-gray-200">+</button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    Each label is {w} × {h} mm · {config.columns} per row = {Math.round(w * config.columns)}mm wide
                  </p>
                </div>

              </>)}

              {/* ── ITEMS TAB ─────────────────────────────────────────────── */}
              {activeTab === 'items' && (<>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Barcode Values & Quantities</p>
                  {config.codeType === 'barcode' && (
                    <button onClick={generateAll}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-lg transition-colors">
                      Auto-fill empty
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <ItemCodeRow
                      key={item.id}
                      item={item}
                      format={config.barcodeFormat}
                      value={config.codeType === 'barcode' ? (perItemCodes[item.id] ?? '') : item.id}
                      onChange={v => setPerItemCodes(p => ({ ...p, [item.id]: v }))}
                      qty={perItemQty[item.id] ?? 1}
                      onQtyChange={q => setPerItemQty(p => ({ ...p, [item.id]: q }))}
                      isPreview={previewIdx === idx}
                      onSelect={() => setPreviewIdx(idx)}
                    />
                  ))}
                </div>
              </>)}

            </div>
          </div>

          {/* ── RIGHT PANEL — live preview ──────────────────────────────────── */}
          <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden min-h-0">

            {/* Preview header */}
            <div className="shrink-0 px-5 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-700">Live Preview</p>
                <p className="text-[10px] text-gray-400">
                  {config.size !== 'custom' ? SIZE_PRESETS[config.size as Exclude<LabelSize,'custom'>].label : `${w} × ${h} mm`}
                  {' · '}{config.codeType === 'barcode' ? FORMAT_META[config.barcodeFormat].label : `QR (ECC-${config.qrEcc})`}
                </p>
              </div>
              {/* Item navigator */}
              {items.length > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setPreviewIdx(i => Math.max(0, i - 1))}
                    disabled={previewIdx === 0}
                    className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 disabled:opacity-30 hover:bg-gray-200">
                    ‹
                  </button>
                  <span className="text-xs font-semibold text-gray-500">{previewIdx + 1} / {items.length}</span>
                  <button onClick={() => setPreviewIdx(i => Math.min(items.length - 1, i + 1))}
                    disabled={previewIdx === items.length - 1}
                    className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 disabled:opacity-30 hover:bg-gray-200">
                    ›
                  </button>
                </div>
              )}
            </div>

            {/* Preview canvas */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-6">
              <div className="flex flex-col items-center gap-4">
                {/* Checkerboard background to simulate sticker stock */}
                <div className="p-3 rounded-2xl shadow-inner"
                  style={{ background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%) 0 0 / 12px 12px' }}>
                  {previewItem && (
                    <LabelPreview
                      key={`${previewItem.id}-${config.codeType}-${config.barcodeFormat}-${config.size}-${w}-${h}-${config.showName}-${config.showPrice}-${config.showCategory}-${config.showCodeText}-${config.qrEcc}`}
                      item={previewItem}
                      config={config}
                      codeValue={previewCode}
                    />
                  )}
                </div>
                <p className="text-xs text-gray-400 text-center max-w-xs">
                  Showing label for <strong className="text-gray-600">{previewItem?.name}</strong>.
                  {items.length > 1 && ' Use arrows above to cycle items.'}
                </p>

                {/* Mini sheet preview */}
                <div className="mt-2 bg-white border border-gray-200 rounded-xl p-4 w-full max-w-sm">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Print Sheet Layout</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: Math.min(totalLabels, 24) }).map((_, i) => (
                      <div key={i} className="bg-gray-100 border border-gray-200 rounded-sm"
                        style={{ width: `${Math.max(8, 100 / config.columns - 2)}%`, aspectRatio: `${w}/${h}` }} />
                    ))}
                    {totalLabels > 24 && (
                      <div className="flex items-center justify-center text-[10px] text-gray-400 font-semibold px-2">
                        +{totalLabels - 24} more
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">
                    {config.columns} col{config.columns !== 1 ? 's' : ''} · {totalLabels} label{totalLabels !== 1 ? 's' : ''} · {PAPER_SIZES[config.paperSize].label}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-100 px-5 py-3.5 flex items-center justify-between bg-white gap-3">
          <div className="text-sm text-gray-500 min-w-0">
            {config.codeType === 'barcode' && validCount < items.length && (
              <p className="text-amber-600 font-semibold text-xs">
                ⚠ {items.length - validCount} item{items.length - validCount !== 1 ? 's have' : ' has'} invalid codes — go to <button onClick={() => setActiveTab('items')} className="underline">Items tab</button> to fix
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose}
              className="px-4 py-2 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting || items.length === 0 || (config.codeType === 'barcode' && validCount === 0)}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center gap-2 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              {isPrinting ? 'Preparing…' : `Print ${totalLabels} Label${totalLabels !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
