'use client'

export type PrintTarget = 'receipt' | 'report'

// Paper width chosen in Settings. Falls back to 80mm, the common roll.
function getReceiptWidth(): '58mm' | '80mm' {
  try {
    return localStorage.getItem('receiptPrinterWidth') === '58mm' ? '58mm' : '80mm'
  } catch {
    return '80mm'
  }
}

export function saveReceiptWidth(width: string) {
  try {
    localStorage.setItem('receiptPrinterWidth', width)
  } catch {
    // ignore
  }
}

/**
 * What happens to the receipt once a POS sale completes.
 *
 *  preview — show it on screen, cashier chooses to print (the old behaviour)
 *  print   — print straight away, no modal
 *  none    — neither; for tills that do not hand out receipts
 */
export type ReceiptBehaviour = 'preview' | 'print' | 'none'

export function getReceiptBehaviour(): ReceiptBehaviour {
  try {
    const v = localStorage.getItem('posReceiptBehaviour')
    return v === 'print' || v === 'none' ? v : 'preview'
  } catch {
    return 'preview'
  }
}

export function saveReceiptBehaviour(v: ReceiptBehaviour) {
  try {
    localStorage.setItem('posReceiptBehaviour', v)
  } catch {
    // ignore
  }
}

/**
 * Stores the printer chosen for each target. window.print() cannot select a
 * printer — this is kept because a print agent will need it, and so the
 * operator's choice is not lost in the meantime.
 */
export function savePrinterName(target: PrintTarget, name: string | null) {
  try {
    const key = target === 'receipt' ? 'receiptPrinterName' : 'reportPrinterName'
    if (name) localStorage.setItem(key, name)
    else localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/**
 * Print the given element.
 *
 * Uses window.print(), which prints silently when the browser runs with
 * --kiosk-printing and otherwise opens the print dialog.
 *
 * A local bridge (QZ Tray) was tried and removed: a page served over public
 * HTTPS cannot open a connection to localhost, so the browser refused it
 * regardless of certificate or CSP. Silent printing at true physical size
 * needs a print agent that polls the server rather than one the page calls.
 *
 * Pass `element` to print a specific DOM element, or omit for the whole page.
 */
export async function smartPrint(
  target: PrintTarget,
  element?: HTMLElement | null
): Promise<void> {
  //
  // Receipts need the thermal page geometry rather than the app-wide A4 rule.
  // ThermalReceipt sets this itself while mounted, but surfaces that build
  // their own receipt markup (the POS modal) do not, so apply it here for the
  // duration of the print and take it back off afterwards.
  const isReceipt = target === 'receipt' && Boolean(element?.closest('.thermal-receipt') ?? element?.classList.contains('thermal-receipt'))
  const root = document.documentElement
  const alreadyMarked = root.classList.contains('printing-receipt')
  let pageStyle: HTMLStyleElement | null = null

  // Reparent the receipt to <body> for the duration of the print. Hiding
  // siblings only collapses the page when the receipt is a direct child;
  // nested inside layout wrappers, its own ancestors kept the page as wide as
  // the POS screen and the printer scaled that down — the receipt printed tiny
  // and centred on the roll. A placeholder marks where to put it back.
  let placeholder: Comment | null = null
  let movedNode: HTMLElement | null = null

  if (isReceipt && element && element.parentNode !== document.body) {
    placeholder = document.createComment('receipt-print-placeholder')
    element.parentNode?.insertBefore(placeholder, element)
    document.body.appendChild(element)
    movedNode = element
  }

  if (isReceipt && !alreadyMarked) {
    root.classList.add('printing-receipt')
    pageStyle = document.createElement('style')
    const width = getReceiptWidth()
    // @page is the full paper width; the receipt itself is the narrower
    // printable area, centred, because a thermal head leaves a dead margin at
    // each edge. Ancestors are pinned to the paper so nothing is wider than the
    // roll — a page wider than the paper is what the driver shrinks to fit, and
    // that shrink is what made the content print small.
    const printable = width === '58mm' ? '48mm' : '72mm'
    pageStyle.textContent =
      `@media print {` +
      `  @page { size: ${width} auto; margin: 0; }` +
      `  html.printing-receipt, html.printing-receipt body,` +
      `  html.printing-receipt main, html.printing-receipt main > * {` +
      `    width: ${width} !important; min-width: 0 !important;` +
      `    max-width: ${width} !important; margin: 0 !important;` +
      `    padding: 0 !important;` +
      `    transform: none !important; zoom: 1 !important;` +
      `  }` +
      `  html.printing-receipt .thermal-receipt {` +
      `    width: ${printable} !important; min-width: 0 !important;` +
      `    max-width: ${printable} !important;` +
      `    margin: 0 auto !important; padding: 0 !important;` +
      `    transform: none !important; zoom: 1 !important;` +
      `  }` +
      `}`
    document.head.appendChild(pageStyle)
  }

  try {
    window.print()
  } finally {
    if (movedNode && placeholder?.parentNode) {
      placeholder.parentNode.insertBefore(movedNode, placeholder)
      placeholder.remove()
    }
    if (pageStyle) {
      pageStyle.remove()
      root.classList.remove('printing-receipt')
    }
  }
}
